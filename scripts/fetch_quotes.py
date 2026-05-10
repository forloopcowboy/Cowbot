"""Fetch ETF/stock quotes via yfinance.

Returns last close + 1m/3m/12m total return for each ticker.
Tickers that fail to resolve are reported in `unresolved`.
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass, asdict
from datetime import date

import yfinance as yf
from rich.progress import (
    Progress,
    SpinnerColumn,
    TextColumn,
    BarColumn,
    TaskProgressColumn,
    TimeElapsedColumn,
)

from _ui import console, warn


@dataclass
class Quote:
    ticker: str
    last_close: float | None
    currency: str | None
    return_1m_pct: float | None
    return_3m_pct: float | None
    return_12m_pct: float | None
    name: str | None = None


def _pct(now: float, then: float | None) -> float | None:
    if then is None or then == 0:
        return None
    return round((now / then - 1) * 100, 2)


def fetch_one(ticker: str) -> Quote:
    try:
        t = yf.Ticker(ticker)
        hist = t.history(period="13mo", auto_adjust=True)
        if hist.empty:
            return Quote(ticker, None, None, None, None, None)
        closes = hist["Close"]
        last = float(closes.iloc[-1])
        def at(off: int) -> float | None:
            if len(closes) <= off:
                return None
            return float(closes.iloc[-1 - off])
        info_obj = getattr(t, "fast_info", None) or {}
        currency = (
            info_obj.get("currency") if isinstance(info_obj, dict)
            else getattr(info_obj, "currency", None)
        )
        name = None
        try:
            name = t.info.get("shortName") or t.info.get("longName")
        except Exception:
            pass
        return Quote(
            ticker=ticker,
            last_close=round(last, 4),
            currency=currency,
            return_1m_pct=_pct(last, at(21)),
            return_3m_pct=_pct(last, at(63)),
            return_12m_pct=_pct(last, at(252)),
            name=name,
        )
    except Exception as e:
        warn(f"{ticker}: {e}")
        return Quote(ticker, None, None, None, None, None)


def fetch_many(tickers: list[str], show_progress: bool = True) -> dict:
    quotes: list[Quote] = []
    if show_progress and tickers:
        with Progress(
            SpinnerColumn(style="cyan"),
            TextColumn("[bold]Quotes[/bold]"),
            BarColumn(),
            TaskProgressColumn(),
            TextColumn("[dim]{task.fields[ticker]}[/dim]"),
            TimeElapsedColumn(),
            console=console,
            transient=False,
        ) as progress:
            task = progress.add_task("fetch", total=len(tickers), ticker="")
            for t in tickers:
                progress.update(task, ticker=t)
                quotes.append(fetch_one(t))
                progress.advance(task)
    else:
        quotes = [fetch_one(t) for t in tickers]

    resolved = [asdict(q) for q in quotes if q.last_close is not None]
    unresolved = [q.ticker for q in quotes if q.last_close is None]
    if unresolved:
        warn(f"unresolved: {', '.join(unresolved)}")
    return {
        "as_of": date.today().isoformat(),
        "quotes": resolved,
        "unresolved": unresolved,
    }


if __name__ == "__main__":
    tickers = sys.argv[1:] or ["VWCE.DE", "SXR8.DE", "EURBRL=X"]
    print(json.dumps(fetch_many(tickers), indent=2))
