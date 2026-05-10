"""Fetch Brazilian macro data: SELIC, IPCA, Tesouro Direto.

Sources:
- BCB SGS API (no auth): https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados
  * 432 = SELIC meta (annual %)
  * 433 = IPCA monthly variation (%)
- Tesouro Transparente (Tesouro Direto current prices/yields, big CSV).
"""
from __future__ import annotations

import io
import json
import sys
from datetime import date, timedelta

import pandas as pd
import requests

from _ui import step, warn

BCB_SERIES_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados"
TESOURO_CSV_URL = (
    "https://www.tesourotransparente.gov.br/ckan/dataset/"
    "df56aa42-484a-4a59-8184-7676580c81e3/resource/"
    "796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv"
)


def _bcb_series(code: int, days: int = 90) -> list[dict]:
    end = date.today()
    start = end - timedelta(days=days)
    params = {
        "formato": "json",
        "dataInicial": start.strftime("%d/%m/%Y"),
        "dataFinal": end.strftime("%d/%m/%Y"),
    }
    r = requests.get(BCB_SERIES_URL.format(code=code), params=params, timeout=15)
    r.raise_for_status()
    return r.json()


def selic_latest() -> dict:
    try:
        rows = _bcb_series(432, days=30)
        if not rows:
            return {"error": "no SELIC data"}
        last = rows[-1]
        return {"date": last["data"], "selic_annual_pct": float(last["valor"])}
    except Exception as e:
        return {"error": str(e)}


def ipca_recent() -> dict:
    try:
        rows = _bcb_series(433, days=400)
        if not rows:
            return {"error": "no IPCA data"}
        last3 = rows[-3:]
        last12 = rows[-12:] if len(rows) >= 12 else rows
        # Compound 12m IPCA from monthly variations
        prod = 1.0
        for r in last12:
            prod *= 1 + float(r["valor"]) / 100
        return {
            "last_month": {"date": last3[-1]["data"], "pct": float(last3[-1]["valor"])},
            "last_3m_pct": [{"date": r["data"], "pct": float(r["valor"])} for r in last3],
            "ipca_12m_pct": round((prod - 1) * 100, 2),
        }
    except Exception as e:
        return {"error": str(e)}


def tesouro_summary() -> dict:
    """Return a small summary of Tesouro Direto current rates by category."""
    try:
        r = requests.get(TESOURO_CSV_URL, timeout=30)
        r.raise_for_status()
        df = pd.read_csv(io.BytesIO(r.content), sep=";", decimal=",")
        # Typical columns: Tipo Titulo, Data Vencimento, Data Base, Taxa Compra Manha, ...
        latest_date = df["Data Base"].max()
        latest = df[df["Data Base"] == latest_date]
        out: dict = {"as_of": str(latest_date), "by_type": {}}
        for tipo, grp in latest.groupby("Tipo Titulo"):
            buys = pd.to_numeric(grp["Taxa Compra Manha"], errors="coerce").dropna()
            if buys.empty:
                continue
            out["by_type"][tipo] = {
                "count": int(len(grp)),
                "rate_min_pct": round(float(buys.min()), 3),
                "rate_max_pct": round(float(buys.max()), 3),
                "rate_median_pct": round(float(buys.median()), 3),
            }
        return out
    except Exception as e:
        return {"error": str(e)}


def fetch_all() -> dict:
    out: dict = {}
    with step("Fetching SELIC (BCB SGS 432)", ok_msg="SELIC"):
        out["selic"] = selic_latest()
    with step("Fetching IPCA (BCB SGS 433)", ok_msg="IPCA"):
        out["ipca"] = ipca_recent()
    with step("Fetching Tesouro Direto (Tesouro Transparente CSV — slow)", ok_msg="Tesouro Direto"):
        out["tesouro_direto"] = tesouro_summary()
    for k, v in out.items():
        if isinstance(v, dict) and v.get("error"):
            warn(f"{k}: {v['error']}")
    return out


if __name__ == "__main__":
    print(json.dumps(fetch_all(), indent=2, ensure_ascii=False))
