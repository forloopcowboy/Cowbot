"""Render a monthly-report markdown file to a banking-styled PDF.

Usage:
  uv run python to_pdf.py                    # newest report in ../reports
  uv run python to_pdf.py ../reports/2026-05.md
  uv run python to_pdf.py ../reports/2026-05.md -o out.pdf

Requires WeasyPrint system libraries. On macOS:
  brew install pango cairo gdk-pixbuf libffi
"""
from __future__ import annotations

import argparse
import ctypes.util
import os
import sys
from datetime import date
from html import escape
from pathlib import Path


def _ensure_macos_dyld() -> None:
    """macOS dlopen does not search Homebrew lib paths by default.

    WeasyPrint imports cffi which dlopens libgobject/libpango/etc. — these
    live in /opt/homebrew/lib (Apple Silicon) or /usr/local/lib (Intel).
    We prepend whichever exists to DYLD_FALLBACK_LIBRARY_PATH *before*
    weasyprint is imported, so the dlopen calls succeed.
    """
    if sys.platform != "darwin":
        return
    parts = [p for p in ("/opt/homebrew/lib", "/usr/local/lib") if Path(p).is_dir()]
    if not parts:
        return
    existing = os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
    new = ":".join([*parts, existing]) if existing else ":".join(parts)
    os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = new
    # ctypes also caches search results — preload the critical ones explicitly
    # since cffi's ffi.dlopen does not consult DYLD_FALLBACK_LIBRARY_PATH on
    # all macOS versions when SIP-protected Pythons are involved.
    for libname in ("gobject-2.0", "pango-1.0", "harfbuzz", "fontconfig", "pangoft2-1.0"):
        path = ctypes.util.find_library(libname)
        if path is None:
            for d in parts:
                candidate = Path(d) / f"lib{libname}.dylib"
                if candidate.exists():
                    try:
                        ctypes.CDLL(str(candidate))
                    except OSError:
                        pass
                    break


_ensure_macos_dyld()

import markdown as md  # noqa: E402

try:
    from weasyprint import HTML, CSS  # noqa: E402
except OSError as e:
    sys.stderr.write(
        "\nWeasyPrint failed to load native libraries.\n"
        "On macOS this usually means Pango/GLib/Cairo aren't installed via Homebrew, or\n"
        "DYLD_FALLBACK_LIBRARY_PATH does not include the Homebrew prefix.\n\n"
        "Fix:\n"
        "  brew install pango cairo gdk-pixbuf libffi\n"
        "  export DYLD_FALLBACK_LIBRARY_PATH=\"$(brew --prefix)/lib:$DYLD_FALLBACK_LIBRARY_PATH\"\n\n"
        f"Underlying error: {e}\n"
    )
    sys.exit(1)

from _ui import banner, console, err, info  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def reports_dir_for(profile: str) -> Path:
    return ROOT / "profiles" / profile / "reports"

CSS_STYLE = """
@page {
  size: A4;
  margin: 22mm 18mm 24mm 18mm;
  @top-left {
    content: string(doc-title);
    font-family: 'Georgia', serif;
    font-size: 9pt;
    color: #6b7280;
    border-bottom: 0.4pt solid #c7a44a;
    padding-bottom: 4pt;
    width: 100%;
  }
  @top-right {
    content: "Confidential — Personal";
    font-family: 'Georgia', serif;
    font-size: 9pt;
    color: #6b7280;
    border-bottom: 0.4pt solid #c7a44a;
    padding-bottom: 4pt;
  }
  @bottom-left {
    content: "Generated " string(gen-date);
    font-family: 'Georgia', serif;
    font-size: 8.5pt;
    color: #6b7280;
  }
  @bottom-right {
    content: "Page " counter(page) " of " counter(pages);
    font-family: 'Georgia', serif;
    font-size: 8.5pt;
    color: #6b7280;
  }
}

html { font-family: 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif; font-size: 10.5pt; color: #1a1a1a; }
body { line-height: 1.45; }

.cover {
  page: cover;
  string-set: doc-title attr(data-title), gen-date attr(data-date);
  border-top: 6pt solid #0f2944;
  padding-top: 18pt;
  margin-bottom: 18pt;
}
.cover .eyebrow {
  font-family: 'Georgia', serif;
  font-size: 9pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #c7a44a;
  margin-bottom: 4pt;
}
.cover .title {
  font-family: 'Georgia', serif;
  font-size: 26pt;
  color: #0f2944;
  font-weight: 600;
  margin: 0 0 4pt 0;
  letter-spacing: -0.01em;
}
.cover .meta {
  font-size: 9.5pt;
  color: #4b5563;
  margin-top: 8pt;
}
.cover .meta strong { color: #0f2944; }

h1, h2, h3, h4 { font-family: 'Georgia', serif; color: #0f2944; }
h1 { font-size: 18pt; margin: 18pt 0 8pt 0; padding-bottom: 4pt; border-bottom: 0.6pt solid #c7a44a; font-weight: 600; }
h2 { font-size: 13.5pt; margin: 16pt 0 6pt 0; font-weight: 600; }
h3 { font-size: 11.5pt; margin: 12pt 0 4pt 0; color: #1f3a5f; font-weight: 600; }
h4 { font-size: 10.5pt; margin: 10pt 0 3pt 0; color: #1f3a5f; }

p { margin: 4pt 0 6pt 0; }
ul, ol { margin: 4pt 0 6pt 18pt; padding: 0; }
li { margin: 2pt 0; }

strong { color: #0f2944; }

a { color: #1f3a5f; text-decoration: none; }

table {
  border-collapse: collapse;
  width: 100%;
  margin: 8pt 0 12pt 0;
  font-size: 9pt;
  page-break-inside: auto;
}
thead { display: table-header-group; }
th, td {
  border-bottom: 0.4pt solid #d1d5db;
  padding: 4pt 6pt;
  text-align: left;
  vertical-align: top;
}
th {
  background: #0f2944;
  color: #f8fafc;
  font-weight: 600;
  font-family: 'Georgia', serif;
  letter-spacing: 0.02em;
  border-bottom: none;
}
tr:nth-child(even) td { background: #f6f7fb; }
td { font-variant-numeric: tabular-nums; }

code, pre {
  font-family: 'Menlo', 'Consolas', monospace;
  font-size: 9pt;
}
code { background: #f1f3f8; padding: 0.5pt 3pt; border-radius: 2pt; color: #1f3a5f; }
pre {
  background: #f6f7fb;
  border-left: 2pt solid #c7a44a;
  padding: 8pt 10pt;
  margin: 6pt 0 10pt 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}
pre code { background: transparent; padding: 0; }

blockquote {
  margin: 6pt 0;
  padding: 4pt 10pt;
  border-left: 2pt solid #c7a44a;
  color: #374151;
  font-style: italic;
  background: #fafbfd;
}

hr { border: none; border-top: 0.4pt solid #d1d5db; margin: 14pt 0; }

.disclaimer {
  margin-top: 24pt;
  padding-top: 8pt;
  border-top: 0.4pt solid #d1d5db;
  font-size: 8.5pt;
  color: #6b7280;
  font-style: italic;
}
"""

DISCLAIMER = (
    "Personal investment notes generated by an automated advisor prompt. "
    "Not financial advice. Verify all figures and account details before acting. "
    "Past performance does not guarantee future results."
)


def find_latest_report(profile: str) -> Path | None:
    rdir = reports_dir_for(profile)
    if not rdir.exists():
        return None
    candidates = sorted(rdir.glob("*.md"))
    return candidates[-1] if candidates else None


def render_html(md_text: str, title: str, gen_date: str) -> str:
    html_body = md.markdown(
        md_text,
        extensions=["tables", "fenced_code", "sane_lists", "toc"],
        output_format="html5",
    )
    return f"""<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>{escape(title)}</title></head>
<body>
  <header class="cover" data-title="{escape(title)}" data-date="{escape(gen_date)}">
    <div class="eyebrow">Personal Portfolio · Monthly Report</div>
    <h1 class="title">{escape(title)}</h1>
    <div class="meta">Prepared <strong>{escape(gen_date)}</strong></div>
  </header>
  <main>
    {html_body}
  </main>
  <p class="disclaimer">{escape(DISCLAIMER)}</p>
</body>
</html>"""


def derive_title(md_path: Path, md_text: str) -> str:
    for line in md_text.splitlines():
        s = line.strip()
        if s.startswith("# "):
            return s[2:].strip()
    return f"Investment Report — {md_path.stem}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", help="Path to .md file (default: newest in profile reports/)")
    parser.add_argument("-o", "--output", help="Output .pdf path (default: alongside input)")
    parser.add_argument("--profile", default="default", help="profile name (default: default) — used when input omitted")
    args = parser.parse_args()

    banner("Rendering report to PDF")

    md_path = Path(args.input).resolve() if args.input else find_latest_report(args.profile)
    if md_path is None or not md_path.exists():
        err(f"No markdown report found in profile '{args.profile}'. Generate one with generate_report.py first.")
        sys.exit(1)

    out_path = Path(args.output).resolve() if args.output else md_path.with_suffix(".pdf")
    info(f"Input:  [cyan]{md_path}[/cyan]")
    info(f"Output: [cyan]{out_path}[/cyan]")

    md_text = md_path.read_text()
    title = derive_title(md_path, md_text)
    gen_date = date.today().strftime("%B %d, %Y")

    with console.status("[cyan]Rendering markdown → HTML…", spinner="dots"):
        html_str = render_html(md_text, title, gen_date)

    with console.status("[cyan]Composing PDF (WeasyPrint)…", spinner="dots"):
        HTML(string=html_str, base_url=str(md_path.parent)).write_pdf(
            target=str(out_path),
            stylesheets=[CSS(string=CSS_STYLE)],
        )

    size_kb = out_path.stat().st_size / 1024
    console.log(f"[green]✓[/green] Wrote [bold]{out_path.name}[/bold] ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
