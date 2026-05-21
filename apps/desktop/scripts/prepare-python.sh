#!/usr/bin/env bash
# Vendor python-build-standalone + bundle scripts into desktop/resources/.
# Skips re-download if already vendored. Run before `electron-builder`.
set -euo pipefail

PY_VERSION="3.12.7"
PBS_TAG="20241008"

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
RES="$ROOT/resources"
# Repo root — the python scripts, prompts, and seed profiles live here.
# `ROOT` is apps/desktop, so the repo root is two levels up.
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"

mkdir -p "$RES"

# --- Detect host ---
case "$(uname -s)" in
  Darwin*)
    case "$(uname -m)" in
      arm64)  PBS_ARCH="aarch64-apple-darwin" ;;
      x86_64) PBS_ARCH="x86_64-apple-darwin"  ;;
      *) echo "unsupported macOS arch: $(uname -m)" >&2; exit 1 ;;
    esac
    PBS_PLATFORM="apple-darwin"
    ;;
  Linux*)
    PBS_ARCH="x86_64-unknown-linux-gnu"
    PBS_PLATFORM="linux"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    PBS_ARCH="x86_64-pc-windows-msvc"
    PBS_PLATFORM="windows"
    ;;
  *) echo "unsupported OS" >&2; exit 1 ;;
esac

PBS_FILE="cpython-${PY_VERSION}+${PBS_TAG}-${PBS_ARCH}-install_only.tar.gz"
PBS_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${PBS_FILE}"

PY_DIR="$RES/python"
if [ ! -x "$PY_DIR/bin/python3" ] && [ ! -x "$PY_DIR/python.exe" ]; then
  echo "==> Downloading python-build-standalone ${PY_VERSION} (${PBS_ARCH})"
  TMP="$(mktemp -d)"
  curl -fL --progress-bar "$PBS_URL" -o "$TMP/python.tar.gz"
  rm -rf "$PY_DIR"
  mkdir -p "$PY_DIR"
  tar -xzf "$TMP/python.tar.gz" -C "$TMP"
  # The archive extracts a top-level `python/` dir.
  cp -R "$TMP/python/." "$PY_DIR/"
  rm -rf "$TMP"
else
  echo "==> Re-using cached Python at $PY_DIR"
fi

if [ "$PBS_PLATFORM" = "windows" ]; then
  PY="$PY_DIR/python.exe"
else
  PY="$PY_DIR/bin/python3"
fi

echo "==> Installing Python dependencies"
"$PY" -m pip install --upgrade pip --quiet
"$PY" -m pip install --quiet \
  "anthropic>=0.40" \
  "yfinance>=0.2.40" \
  "pandas>=2.2" \
  "requests>=2.32" \
  "pyyaml>=6.0" \
  "rich>=13.7" \
  "markdown>=3.6" \
  "python-dotenv>=1.0"

echo "==> Copying scripts"
SCRIPTS_DST="$RES/scripts"
rm -rf "$SCRIPTS_DST"
mkdir -p "$SCRIPTS_DST"
SCRIPTS_SRC="$REPO_ROOT/scripts"
for f in build_context.py generate_report.py fetch_quotes.py fetch_brazil.py fetch_fx.py _ui.py; do
  cp "$SCRIPTS_SRC/$f" "$SCRIPTS_DST/$f"
done

# The default profile is intended as a working dev snapshot, not a sample to
# ship to users. Keep it out of distributable builds; users start with an empty
# profile list and create their own via the in-app wizard. Set INVPLAN_SHIP_SEED=1
# to opt in (e.g. local-dev packaging).
SEED="$RES/seed/default"
rm -rf "$RES/seed"
if [ "${INVPLAN_SHIP_SEED:-0}" = "1" ]; then
  echo "==> Seeding default profile snapshot for first-run (INVPLAN_SHIP_SEED=1)"
  mkdir -p "$SEED/reports"
  DEFAULT_SRC="$REPO_ROOT/profiles/default"
  [ -f "$DEFAULT_SRC/profile.yaml" ] && cp "$DEFAULT_SRC/profile.yaml" "$SEED/profile.yaml"
  [ -f "$DEFAULT_SRC/holdings.csv" ] && cp "$DEFAULT_SRC/holdings.csv" "$SEED/holdings.csv"
else
  echo "==> Skipping seed profile (set INVPLAN_SHIP_SEED=1 to bundle profiles/default)"
  # electron-builder's extraResources still expects the directory to exist.
  mkdir -p "$RES/seed"
fi

echo "==> Bundling prompts"
PROMPTS_DST="$RES/prompts"
rm -rf "$PROMPTS_DST"
mkdir -p "$PROMPTS_DST"
cp -R "$REPO_ROOT/prompts/." "$PROMPTS_DST/"

echo "==> Done. Resources prepared in: $RES"
echo "    Python:  $PY_DIR ($(du -sh "$PY_DIR" 2>/dev/null | awk '{print $1}'))"
echo "    Scripts: $SCRIPTS_DST"
if [ "${INVPLAN_SHIP_SEED:-0}" = "1" ]; then
  echo "    Seed:    $SEED"
fi
echo "    Prompts: $PROMPTS_DST"
