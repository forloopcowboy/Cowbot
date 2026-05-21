#!/usr/bin/env bash
# Build the macOS desktop app and upload the DMG to the production SSH host
# where the web frontend can serve it as a download.
#
# Usage:
#   npm run publish:mac <user@host | host>
#
# Direct form:
#   bash scripts/publish-mac.sh <user@host | host>
#
# What it does:
#   1. Runs `npm run dist:mac` in apps/desktop, which builds the renderer,
#      packages the python runtime, and runs electron-builder --mac. The DMG
#      lands in apps/desktop/release/.
#   2. SCPs the .dmg up to the remote at $REMOTE_DOWNLOADS_DIR under a stable
#      filename ($REMOTE_FILENAME) so the marketing site can link to it at a
#      stable URL.
#   3. Ensures DOWNLOAD_URL_MAC is set in the remote deploy/.env so a
#      subsequent `npm run deploy:ssh:web` rebakes the SPA with the right URL.
#
# Env overrides:
#   REMOTE_USER            default: $USER (only used when arg is bare host)
#   REMOTE_DIR             default: ~/invest-app
#   REMOTE_DOWNLOADS_DIR   default: $REMOTE_DIR/deploy/downloads
#   REMOTE_FILENAME        default: cowboy-investor-mac.dmg
#   DOWNLOAD_URL_PATH      default: /downloads/$REMOTE_FILENAME
#                          (path appended to https://$WEB_HOST/ for the public URL)
#   SSH_OPTS               passed verbatim to ssh / scp (e.g. "-p 2222 -i ~/.ssh/id")
#   SKIP_BUILD             set to 1 to skip the dist:mac build and just upload
#                          whatever .dmg already exists in apps/desktop/release/
#
# The remote's deploy/.env is preserved; this script only inserts/updates the
# single DOWNLOAD_URL_MAC line. The DMG itself lives in deploy/downloads/ on
# the remote, which deploy-ssh.sh is configured to NEVER rsync over.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: npm run publish:mac <user@host | host>" >&2
  exit 64
fi

TARGET="$1"
if [[ "$TARGET" == *"@"* ]]; then
  REMOTE="$TARGET"
else
  REMOTE="${REMOTE_USER:-$USER}@$TARGET"
fi

REMOTE_DIR="${REMOTE_DIR:-~/invest-app}"
REMOTE_DOWNLOADS_DIR="${REMOTE_DOWNLOADS_DIR:-$REMOTE_DIR/deploy/downloads}"
REMOTE_FILENAME="${REMOTE_FILENAME:-cowboy-investor-mac.dmg}"
DOWNLOAD_URL_PATH="${DOWNLOAD_URL_PATH:-/downloads/$REMOTE_FILENAME}"
SSH_OPTS="${SSH_OPTS:-}"
SKIP_BUILD="${SKIP_BUILD:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DESKTOP_DIR="$REPO_ROOT/apps/desktop"
RELEASE_DIR="$DESKTOP_DIR/release"

echo "==> Target:              $REMOTE"
echo "==> Remote downloads:    $REMOTE_DOWNLOADS_DIR"
echo "==> Remote filename:     $REMOTE_FILENAME"
echo "==> Download URL path:   $DOWNLOAD_URL_PATH"
echo

# ---- 1) build the dmg -------------------------------------------------------
if [[ -z "$SKIP_BUILD" ]]; then
  echo "==> Building macOS DMG (apps/desktop · npm run dist:mac) ..."
  ( cd "$DESKTOP_DIR" && npm run dist:mac )
else
  echo "==> SKIP_BUILD=1 — using existing build in $RELEASE_DIR"
fi

if [[ ! -d "$RELEASE_DIR" ]]; then
  echo "ERROR: no release directory at $RELEASE_DIR — did the build succeed?" >&2
  exit 1
fi

# electron-builder names the artifact like "Cowboy Investor-0.1.0-arm64.dmg".
# Grab the most recent .dmg in the release dir.
DMG_PATH="$(ls -t "$RELEASE_DIR"/*.dmg 2>/dev/null | head -n1 || true)"
if [[ -z "$DMG_PATH" ]]; then
  echo "ERROR: no .dmg found in $RELEASE_DIR after build" >&2
  exit 1
fi

DMG_SIZE="$(du -h "$DMG_PATH" | cut -f1)"
echo "==> DMG: $DMG_PATH ($DMG_SIZE)"

# ---- 2) upload --------------------------------------------------------------
echo "==> Ensuring remote downloads dir exists ..."
# shellcheck disable=SC2086
ssh $SSH_OPTS "$REMOTE" "mkdir -p $REMOTE_DOWNLOADS_DIR"

echo "==> Uploading DMG to $REMOTE:$REMOTE_DOWNLOADS_DIR/$REMOTE_FILENAME ..."
# Upload to a .tmp path then rename, so the file is never half-written from
# the web server's point of view.
# shellcheck disable=SC2086
scp $SSH_OPTS "$DMG_PATH" "$REMOTE:$REMOTE_DOWNLOADS_DIR/$REMOTE_FILENAME.tmp"
# shellcheck disable=SC2086
ssh $SSH_OPTS "$REMOTE" "mv $REMOTE_DOWNLOADS_DIR/$REMOTE_FILENAME.tmp $REMOTE_DOWNLOADS_DIR/$REMOTE_FILENAME && chmod 644 $REMOTE_DOWNLOADS_DIR/$REMOTE_FILENAME"

# ---- 3) make sure DOWNLOAD_URL_MAC is set in remote deploy/.env -------------
# Reads WEB_HOST from the remote .env so the public URL is correct without
# the publisher having to hardcode it locally.
echo "==> Updating DOWNLOAD_URL_MAC in $REMOTE:$REMOTE_DIR/deploy/.env ..."
# shellcheck disable=SC2086
ssh $SSH_OPTS "$REMOTE" "ENV_FILE=$REMOTE_DIR/deploy/.env URL_PATH='$DOWNLOAD_URL_PATH' bash -s" <<'REMOTE_EOF'
set -euo pipefail
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE does not exist — run npm run deploy:ssh first." >&2
  exit 1
fi
WEB_HOST="$(grep -E '^WEB_HOST=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"' || true)"
if [[ -z "$WEB_HOST" ]]; then
  echo "ERROR: WEB_HOST not set in $ENV_FILE." >&2
  exit 1
fi
NEW_URL="https://${WEB_HOST}${URL_PATH}"
if grep -qE '^DOWNLOAD_URL_MAC=' "$ENV_FILE"; then
  # Replace in place. Use a sentinel delimiter that won't appear in URLs.
  tmp="$(mktemp)"
  awk -v new="DOWNLOAD_URL_MAC=$NEW_URL" '
    /^DOWNLOAD_URL_MAC=/ { print new; next }
    { print }
  ' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
else
  printf '\n# Public URL of the macOS DMG. Set by scripts/publish-mac.sh.\nDOWNLOAD_URL_MAC=%s\n' "$NEW_URL" >> "$ENV_FILE"
fi
echo "    DOWNLOAD_URL_MAC=$NEW_URL"
REMOTE_EOF

echo
echo "==> Done. The DMG is up. Next step:"
echo "      npm run deploy:ssh:web $REMOTE"
echo "    to rebuild the web image so the homepage download link uses the new URL."
