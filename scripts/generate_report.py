"""Generate the monthly investment report.

Reads the prompt template, substitutes placeholders from the structured
context written by build_context.py (or builds it now if missing),
calls the Anthropic API, and saves the report to
../profiles/<name>/reports/<name>-YYYY-MM.md.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

import yaml
from dotenv import load_dotenv

import build_context as bc
from _ui import banner, console, err, info
from anthropic import Anthropic

# Load .env from repo root and from scripts/ (scripts/ wins on duplicates).
ROOT_ENV = Path(__file__).resolve().parent.parent / ".env"
SCRIPT_ENV = Path(__file__).resolve().parent / ".env"
load_dotenv(ROOT_ENV)
load_dotenv(SCRIPT_ENV, override=True)

# Prompts ship alongside scripts (resources/prompts/ when packaged).
SCRIPTS_ROOT = Path(__file__).resolve().parent.parent
PROMPT_TEMPLATE = SCRIPTS_ROOT / "prompts" / "monthly_report.md"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--profile", default="default", help="profile name under profiles/ (default: default)")
    p.add_argument(
        "--user-considerations-file",
        default=None,
        help="path to a UTF-8 file whose contents fill the '{{user_considerations}}' "
             "section. When omitted, the section is filled with 'None'.",
    )
    p.add_argument(
        "--custom-id",
        default=None,
        help="when set, switches output filename to "
             "'{profile}-{YYYY-MM-DD}-custom-{id}.md'.",
    )
    return p.parse_args(argv)


def _format_table(rows: list[dict], cols: list[str]) -> str:
    out = ["| " + " | ".join(cols) + " |", "|" + "|".join(["---"] * len(cols)) + "|"]
    for r in rows:
        out.append("| " + " | ".join(str(r.get(c, "") if r.get(c) is not None else "") for c in cols) + " |")
    return "\n".join(out)


def render_prompt(
    template: str,
    ctx: dict,
    profile: dict,
    user_considerations: str = "None",
) -> tuple[str, str]:
    """Return (static_block, dynamic_block) — split for prompt caching."""
    today = date.today()
    report_month = today.strftime("%Y-%m")
    contrib_low, contrib_high = profile["profile"]["monthly_contribution_eur"]

    valued = ctx["holdings_valued"]
    cash_total = sum(r["market_value_eur"] or 0 for r in valued if r.get("asset_class") == "cash")

    holdings_table = _format_table(
        valued,
        ["account", "instrument", "ticker", "quantity", "avg_cost", "price",
         "market_value_eur", "pnl_eur", "pnl_pct", "currency", "asset_class"],
    )

    alloc = ctx["allocation"]
    alloc_lines = [f"Total: {alloc['total_eur']} EUR"]
    alloc_lines.append("By asset class: " + ", ".join(f"{k or '(unset)'} {v}%" for k, v in alloc["by_asset_class_pct"].items()))
    alloc_lines.append("By currency: " + ", ".join(f"{k or '(unset)'} {v}%" for k, v in alloc["by_currency_pct"].items()))
    allocation_summary_str = "\n".join(alloc_lines)

    watchlist_quotes = _format_table(
        ctx["quotes"]["quotes"],
        ["ticker", "name", "last_close", "currency", "return_1m_pct", "return_3m_pct", "return_12m_pct"],
    )

    fx_lines = "\n".join(
        f"- {r['pair']}: {r['rate']} (as of {r['as_of']}, src: {r['source']})"
        for r in ctx["fx"]["rates"]
    )

    br = ctx["brazil"]
    br_lines = []
    s = br.get("selic", {})
    if "selic_annual_pct" in s:
        br_lines.append(f"- SELIC: {s['selic_annual_pct']}% (annual, {s['date']})")
    i = br.get("ipca", {})
    if "ipca_12m_pct" in i:
        br_lines.append(f"- IPCA 12m: {i['ipca_12m_pct']}%")
    td = br.get("tesouro_direto", {})
    if "by_type" in td:
        br_lines.append(f"- Tesouro Direto (as of {td['as_of']}):")
        for tipo, st in td["by_type"].items():
            br_lines.append(f"  - {tipo}: median {st['rate_median_pct']}%")
    brazil_macro = "\n".join(br_lines)

    unresolved = ctx.get("unresolved_held_tickers", []) + ctx.get("quotes", {}).get("unresolved", [])
    unresolved_str = "\n".join(f"- {t}" for t in sorted(set(unresolved))) or "(none)"

    profile_yaml_str = yaml.safe_dump(profile, sort_keys=False, allow_unicode=True)

    # Render the template once. User-provided text is replaced LAST so any
    # placeholder-looking content inside it is treated as literal text by the
    # model rather than triggering further substitution.
    rendered = (
        template
        .replace("{{report_month}}", report_month)
        .replace("{{profile_yaml}}", profile_yaml_str)
        .replace("{{holdings_table}}", holdings_table)
        .replace("{{allocation_summary}}", allocation_summary_str)
        .replace("{{cash_total_eur}}", f"{cash_total:.2f}")
        .replace("{{unresolved_tickers}}", unresolved_str)
        .replace("{{watchlist_quotes}}", watchlist_quotes)
        .replace("{{fx_rates}}", fx_lines)
        .replace("{{brazil_macro}}", brazil_macro)
        .replace("{{contribution_low}}", str(contrib_low))
        .replace("{{contribution_high}}", str(contrib_high))
        .replace("{{user_considerations}}", user_considerations)
    )

    # Split for caching: everything up to and including "## Current state" is fairly stable;
    # the live data after it changes every run. Keep it simple — cache the first half.
    marker = "## Current state"
    if marker in rendered:
        idx = rendered.index(marker)
        return rendered[:idx], rendered[idx:]
    return rendered, ""


def load_or_build_context(profile_name: str, paths: dict) -> dict:
    if not paths["context_json"].exists():
        info("Context cache missing; building now…")
        bc.main(["--profile", profile_name])
    return json.loads(paths["context_json"].read_text())


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    paths = bc.profile_paths(args.profile)
    if not paths["yaml"].exists():
        err(f"Profile not found: {paths['dir']}")
        sys.exit(1)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        err("ANTHROPIC_API_KEY not set. Drop it into .env (repo root or scripts/) or export it.")
        sys.exit(1)

    banner(f"Generating report · profile [bold]{args.profile}[/bold]")
    profile = yaml.safe_load(paths["yaml"].read_text())
    ctx = load_or_build_context(args.profile, paths)
    template = PROMPT_TEMPLATE.read_text()

    user_considerations = "None"
    if args.user_considerations_file:
        uc_path = Path(args.user_considerations_file)
        if not uc_path.exists():
            err(f"User considerations file not found: {uc_path}")
            sys.exit(1)
        text = uc_path.read_text(encoding="utf-8").strip()
        if text:
            user_considerations = text
            info(f"User considerations: {len(text):,} chars")

    static_block, dynamic_block = render_prompt(template, ctx, profile, user_considerations)

    model = profile.get("reporting", {}).get("model", "claude-opus-4-7")
    info(f"Model: [bold]{model}[/bold]")
    info(f"Static block: {len(static_block):,} chars  ·  dynamic block: {len(dynamic_block):,} chars")

    client = Anthropic()
    user_content: list[dict] = [
        {"type": "text", "text": static_block, "cache_control": {"type": "ephemeral"}},
    ]
    if dynamic_block:
        user_content.append({"type": "text", "text": dynamic_block})

    with console.status("[cyan]Calling Anthropic API… (this can take 30–60s)", spinner="dots"):
        msg = client.messages.create(
            model=model,
            max_tokens=4000,
            system="You are a careful, concise personal portfolio advisor. Output only the requested markdown report.",
            messages=[{"role": "user", "content": user_content}],
        )

    report_text = "".join(b.text for b in msg.content if b.type == "text")

    paths["reports"].mkdir(parents=True, exist_ok=True)
    if args.custom_id:
        out_name = f"{args.profile}-{date.today():%Y-%m-%d}-custom-{args.custom_id}.md"
    else:
        out_name = f"{args.profile}-{date.today():%Y-%m}.md"
    out_path = paths["reports"] / out_name
    out_path.write_text(report_text)

    usage = msg.usage
    # Emit as banner + info lines so the desktop UI can categorize each entry
    # cleanly (Rich's Panel/Table renders box-drawing characters that the
    # frontend can't pattern-match).
    banner("Report generated")
    info(f"Report: [bold green]{out_path}[/bold green]")
    info(f"Input tokens: {usage.input_tokens:,}")
    info(f"Cache creation: {getattr(usage, 'cache_creation_input_tokens', 0):,}")
    info(f"Cache read: {getattr(usage, 'cache_read_input_tokens', 0):,}")
    info(f"Output tokens: {usage.output_tokens:,}")


if __name__ == "__main__":
    main()
