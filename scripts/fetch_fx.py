"""Fetch FX rates: EUR/BRL, EUR/USD.

Primary: ECB Statistical Data Warehouse (no auth).
Fallback: yfinance.
"""
from __future__ import annotations

import json
import sys
from datetime import date

import requests
import yfinance as yf

from _ui import step

ECB_URL = "https://data-api.ecb.europa.eu/service/data/EXR/D.{ccy}.EUR.SP00.A"


def _ecb_latest(ccy: str) -> tuple[float | None, str | None]:
    try:
        r = requests.get(
            ECB_URL.format(ccy=ccy),
            params={"format": "csvdata", "lastNObservations": 1},
            headers={"Accept": "text/csv"},
            timeout=15,
        )
        r.raise_for_status()
        # CSV has header line; last data line contains ...,date,value
        lines = [ln for ln in r.text.splitlines() if ln.strip()]
        if len(lines) < 2:
            return None, None
        header = lines[0].split(",")
        values = lines[-1].split(",")
        row = dict(zip(header, values))
        d = row.get("TIME_PERIOD") or row.get("TIME PERIOD")
        v = row.get("OBS_VALUE") or row.get("OBS VALUE")
        return (float(v) if v else None), d
    except Exception:
        return None, None


def _yf_fallback(pair: str) -> tuple[float | None, str | None]:
    try:
        h = yf.Ticker(pair).history(period="5d", auto_adjust=True)
        if h.empty:
            return None, None
        return float(h["Close"].iloc[-1]), str(h.index[-1].date())
    except Exception:
        return None, None


def get_pair(target_ccy: str, yf_pair: str) -> dict:
    rate, d = _ecb_latest(target_ccy)
    source = "ECB"
    if rate is None:
        rate, d = _yf_fallback(yf_pair)
        source = "yfinance"
    return {"pair": f"EUR/{target_ccy}", "rate": rate, "as_of": d, "source": source}


def fetch_all() -> dict:
    rates = []
    with step("Fetching EUR/BRL (ECB → yfinance fallback)", ok_msg="EUR/BRL"):
        rates.append(get_pair("BRL", "EURBRL=X"))
    with step("Fetching EUR/USD (ECB → yfinance fallback)", ok_msg="EUR/USD"):
        rates.append(get_pair("USD", "EURUSD=X"))
    return {"as_of": date.today().isoformat(), "rates": rates}


if __name__ == "__main__":
    print(json.dumps(fetch_all(), indent=2))
