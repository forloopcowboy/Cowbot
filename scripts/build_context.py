"""Assemble the markdown context block fed into the monthly-report prompt.

Reads:
  ../profiles/<name>/profile.yaml
  ../profiles/<name>/holdings.csv

Fetches:
  Quotes for held tickers + watchlist (via fetch_quotes.py)
  EUR/BRL, EUR/USD (via fetch_fx.py)
  SELIC, IPCA, Tesouro Direto (via fetch_brazil.py)

Writes:
  ../profiles/<name>/.context.json   # structured data
  ../profiles/<name>/.context.md     # markdown context block
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from pathlib import Path

import yaml

from _ui import banner, info, warn
from fetch_quotes import fetch_many
from fetch_fx import fetch_all as fetch_fx_all
from fetch_brazil import fetch_all as fetch_br_all

# SCRIPTS_ROOT = the dir containing prompts/ (script-relative).
# DATA_ROOT    = where profiles/ lives. Defaults to SCRIPTS_ROOT but is overridable
#                via INVPLAN_ROOT (used by the desktop app, which keeps user data
#                under app.userData, not in resources/).
SCRIPTS_ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = Path(os.environ.get("INVPLAN_ROOT") or SCRIPTS_ROOT)
ROOT = SCRIPTS_ROOT  # back-compat for any code reading ROOT


def profile_paths(profile: str) -> dict[str, Path]:
    pdir = DATA_ROOT / "profiles" / profile
    return {
        "dir": pdir,
        "yaml": pdir / "profile.yaml",
        "holdings": pdir / "holdings.csv",
        "context_json": pdir / ".context.json",
        "context_md": pdir / ".context.md",
        "reports": pdir / "reports",
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--profile", default="default", help="profile name under profiles/ (default: default)")
    return p.parse_args(argv)


def load_holdings(holdings_path: Path) -> list[dict]:
    rows = []
    with holdings_path.open() as f:
        for r in csv.DictReader(f):
            # Trim whitespace on string fields (CSV may have stray spaces).
            r = {k: (v.strip() if isinstance(v, str) else v) for k, v in r.items()}
            r["quantity"] = float(r["quantity"]) if r.get("quantity") else 0.0
            r["avg_cost"] = float(r["avg_cost"]) if r.get("avg_cost") else 0.0
            rows.append(r)
    return rows


def fx_to_eur(currency: str, fx: dict) -> float | None:
    """Return how many EUR 1 unit of `currency` is worth."""
    if currency == "EUR":
        return 1.0
    pair = f"EUR/{currency}"
    for r in fx.get("rates", []):
        if r["pair"] == pair and r.get("rate"):
            return 1.0 / float(r["rate"])
    return None


def value_holdings(rows: list[dict], quotes: dict, fx: dict) -> tuple[list[dict], list[str]]:
    by_ticker = {q["ticker"]: q for q in quotes["quotes"]}
    valued = []
    unresolved = []
    for r in rows:
        ticker = r.get("ticker") or ""
        asset_class = r.get("asset_class", "")
        currency = r.get("currency", "EUR")
        qty = r["quantity"]
        avg = r["avg_cost"]

        if asset_class == "cash":
            price = 1.0  # local currency
        elif ticker and ticker in by_ticker:
            price = by_ticker[ticker]["last_close"]
        else:
            if ticker:
                unresolved.append(ticker)
            price = None

        market_value_local = round(qty * price, 2) if price is not None else None
        cost_basis_local = round(qty * avg, 2)
        rate = fx_to_eur(currency, fx)
        market_value_eur = (
            round(market_value_local * rate, 2)
            if (market_value_local is not None and rate is not None) else None
        )
        cost_basis_eur = (
            round(cost_basis_local * rate, 2)
            if rate is not None else None
        )
        pl_eur = (
            round(market_value_eur - cost_basis_eur, 2)
            if (market_value_eur is not None and cost_basis_eur is not None) else None
        )
        pl_pct = (
            round((market_value_eur / cost_basis_eur - 1) * 100, 2)
            if (market_value_eur is not None and cost_basis_eur) else None
        )
        valued.append(
            {
                **r,
                "price": price,
                "market_value_local": market_value_local,
                "market_value_eur": market_value_eur,
                "cost_basis_eur": cost_basis_eur,
                "pnl_eur": pl_eur,
                "pnl_pct": pl_pct,
                "fx_to_eur": rate,
            }
        )
    return valued, sorted(set(unresolved))


def allocation_summary(valued: list[dict]) -> dict:
    total = sum(r["market_value_eur"] or 0 for r in valued)
    by_class: dict[str, float] = {}
    by_currency: dict[str, float] = {}
    for r in valued:
        mv = r["market_value_eur"] or 0
        by_class[r.get("asset_class", "")] = by_class.get(r.get("asset_class", ""), 0) + mv
        by_currency[r.get("currency", "")] = by_currency.get(r.get("currency", ""), 0) + mv
    return {
        "total_eur": round(total, 2),
        "by_asset_class_pct": {k: round(v / total * 100, 1) for k, v in by_class.items()} if total else {},
        "by_currency_pct": {k: round(v / total * 100, 1) for k, v in by_currency.items()} if total else {},
    }


def md_holdings_table(valued: list[dict]) -> str:
    cols = ["account", "instrument", "ticker", "currency", "quantity", "avg_cost",
            "price", "market_value_local", "market_value_eur", "pnl_eur", "pnl_pct"]
    out = ["| " + " | ".join(cols) + " |", "|" + "|".join(["---"] * len(cols)) + "|"]
    for r in valued:
        row = [str(r.get(c, "") if r.get(c) is not None else "") for c in cols]
        out.append("| " + " | ".join(row) + " |")
    return "\n".join(out)


def md_allocation(summary: dict) -> str:
    lines = [f"Total: **{summary['total_eur']} EUR**", "", "By asset class:"]
    for k, v in sorted(summary["by_asset_class_pct"].items(), key=lambda x: -x[1]):
        lines.append(f"- {k or '(unset)'}: {v}%")
    lines.append("")
    lines.append("By currency:")
    for k, v in sorted(summary["by_currency_pct"].items(), key=lambda x: -x[1]):
        lines.append(f"- {k or '(unset)'}: {v}%")
    return "\n".join(lines)


def md_quotes_table(quotes: dict) -> str:
    cols = ["ticker", "name", "last_close", "currency", "return_1m_pct", "return_3m_pct", "return_12m_pct"]
    out = ["| " + " | ".join(cols) + " |", "|" + "|".join(["---"] * len(cols)) + "|"]
    for q in quotes["quotes"]:
        out.append("| " + " | ".join(str(q.get(c, "") if q.get(c) is not None else "") for c in cols) + " |")
    return "\n".join(out)


def md_fx(fx: dict) -> str:
    lines = []
    for r in fx["rates"]:
        lines.append(f"- **{r['pair']}**: {r['rate']} (as of {r['as_of']}, source: {r['source']})")
    return "\n".join(lines)


def md_brazil(br: dict) -> str:
    lines = []
    s = br.get("selic", {})
    if "selic_annual_pct" in s:
        lines.append(f"- **SELIC** (target rate, annual): {s['selic_annual_pct']}% as of {s['date']}")
    else:
        lines.append(f"- SELIC: error — {s.get('error')}")
    i = br.get("ipca", {})
    if "ipca_12m_pct" in i:
        lines.append(f"- **IPCA** (12m): {i['ipca_12m_pct']}%; last month {i['last_month']['pct']}% ({i['last_month']['date']})")
    else:
        lines.append(f"- IPCA: error — {i.get('error')}")
    td = br.get("tesouro_direto", {})
    if "by_type" in td:
        lines.append(f"- **Tesouro Direto** (as of {td['as_of']}):")
        for tipo, st in td["by_type"].items():
            lines.append(f"  - {tipo}: median {st['rate_median_pct']}% (range {st['rate_min_pct']}–{st['rate_max_pct']}%, n={st['count']})")
    else:
        lines.append(f"- Tesouro Direto: error — {td.get('error')}")
    return "\n".join(lines)


def _print_summary_panel(summary: dict, n_holdings: int, n_quotes: int, n_unresolved: int) -> None:
    # Emit as banner + info lines so the desktop UI can categorize each entry
    # cleanly (Rich's Panel/Table renders box-drawing characters that the
    # frontend can't pattern-match).
    banner("Context summary")
    info(f"Total value: [bold green]{summary['total_eur']:.2f} EUR[/bold green]")
    info(f"Holdings rows: {n_holdings}")
    info(f"Quotes resolved: {n_quotes}")
    if n_unresolved:
        warn(f"Unresolved: {n_unresolved}")
    else:
        info("Unresolved: 0")
    by_ccy = ", ".join(f"{k} {v}%" for k, v in summary["by_currency_pct"].items())
    info(f"By currency: {by_ccy}")


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    paths = profile_paths(args.profile)
    if not paths["yaml"].exists():
        warn(f"Profile not found: {paths['dir']}")
        sys.exit(1)

    banner(f"Building context · profile [bold]{args.profile}[/bold]")
    info(f"Profile: {paths['yaml']}")
    info(f"Holdings: {paths['holdings']}")

    profile = yaml.safe_load(paths["yaml"].read_text())
    holdings = load_holdings(paths["holdings"])
    info(f"Loaded {len(holdings)} holdings rows")

    held_tickers = sorted({r.get("ticker") for r in holdings if r.get("ticker") and r.get("asset_class") != "cash"})
    watchlist = profile.get("watchlist", {})
    extra = list(watchlist.get("etfs", [])) + list(watchlist.get("fx", []))
    all_tickers = sorted(set(held_tickers) | set(extra))

    banner("FX")
    fx = fetch_fx_all()

    banner("Brazil macro")
    br = fetch_br_all()

    banner(f"Quotes ({len(all_tickers)} tickers)")
    quotes = fetch_many(all_tickers)

    valued, unresolved_held = value_holdings(holdings, quotes, fx)
    summary = allocation_summary(valued)

    structured = {
        "profile": profile,
        "holdings_valued": valued,
        "allocation": summary,
        "quotes": quotes,
        "fx": fx,
        "brazil": br,
        "unresolved_held_tickers": unresolved_held,
    }
    paths["context_json"].write_text(json.dumps(structured, indent=2, default=str, ensure_ascii=False))

    md = []
    md.append("## Holdings\n")
    md.append(md_holdings_table(valued))
    md.append("\n## Allocation\n")
    md.append(md_allocation(summary))
    if unresolved_held:
        md.append("\n## Unresolved tickers (no quote)\n")
        md.append("\n".join(f"- {t}" for t in unresolved_held))
    md.append("\n## Watchlist quotes\n")
    md.append(md_quotes_table(quotes))
    md.append("\n## FX\n")
    md.append(md_fx(fx))
    md.append("\n## Brazil macro\n")
    md.append(md_brazil(br))

    paths["context_md"].write_text("\n".join(md))

    if unresolved_held:
        warn(f"Held tickers without quotes: {', '.join(unresolved_held)}")
    info(f"Wrote [cyan]{paths['context_json']}[/cyan]")
    info(f"Wrote [cyan]{paths['context_md']}[/cyan]")
    _print_summary_panel(summary, len(holdings), len(quotes["quotes"]), len(unresolved_held))


if __name__ == "__main__":
    main()
