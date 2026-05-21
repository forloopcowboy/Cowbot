#!/usr/bin/env bash
# Deploy the Investment Plan stack to a remote VM over SSH.
#
# Usage:
#   npm run deploy:ssh        <user@host | host>          # full stack
#   npm run deploy:ssh:web    <user@host | host>          # rebuild & restart web only
#   npm run deploy:ssh:api    <user@host | host>          # rebuild & restart api only
#   npm run deploy:ssh:caddy  <user@host | host>          # reload Caddy (no build)
#
# Direct flag form (what the npm wrappers expand to):
#   bash scripts/deploy-ssh.sh [--only web|api|caddy] <user@host | host>
#
# Optional env overrides:
#   REMOTE_USER   default: $USER  (only used when arg is "host", not "user@host")
#   REMOTE_DIR    default: ~/invest-app
#   COMPOSE_FILE  default: deploy/docker-compose.prod.yml
#   SSH_OPTS      passed verbatim to ssh & rsync (e.g. "-p 2222 -i ~/.ssh/id")
#
# What it does:
#   1. rsyncs the repo (sans node_modules / dist / venvs / .git history) to
#      $REMOTE:$REMOTE_DIR.
#   2. ensures a deploy/.env exists on the remote (copies .env.example as a
#      starting point on first run and refuses to deploy until it's edited).
#   3. Full-stack mode: builds all images, runs Liquibase migrations, then
#      `docker compose up -d` everything.
#      Per-service mode (--only web|api): rebuilds + recreates just that one
#      service. Migrations are NOT run — use the full deploy after schema
#      changes, or run liquibase manually.
#
# It NEVER passes `-v` or removes the pgdata / caddy_data volumes — re-running
# this script is the supported upgrade path and your DB stays put.

set -euo pipefail

ONLY=""
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --only)
      ONLY="${2:-}"
      shift 2
      ;;
    --only=*)
      ONLY="${1#--only=}"
      shift
      ;;
    -h|--help)
      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

if [[ -n "$ONLY" && "$ONLY" != "web" && "$ONLY" != "api" && "$ONLY" != "caddy" ]]; then
  echo "ERROR: --only must be 'web', 'api', or 'caddy' (got '$ONLY')" >&2
  exit 64
fi

if [[ ${#POSITIONAL[@]} -lt 1 ]]; then
  echo "Usage: npm run deploy:ssh[:web|:api] <user@host | host>" >&2
  exit 64
fi

TARGET="${POSITIONAL[0]}"
if [[ "$TARGET" == *"@"* ]]; then
  REMOTE="$TARGET"
else
  REMOTE="${REMOTE_USER:-$USER}@$TARGET"
fi

REMOTE_DIR="${REMOTE_DIR:-~/invest-app}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.prod.yml}"
SSH_OPTS="${SSH_OPTS:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Target:        $REMOTE"
echo "==> Remote dir:    $REMOTE_DIR"
echo "==> Compose file:  $COMPOSE_FILE"
if [[ -n "$ONLY" ]]; then
  echo "==> Scope:         single service ($ONLY)"
else
  echo "==> Scope:         full stack"
fi
echo

# ---- 1) sanity-check the remote --------------------------------------------
# shellcheck disable=SC2086
ssh $SSH_OPTS "$REMOTE" "command -v docker >/dev/null && docker compose version >/dev/null" \
  || { echo "ERROR: docker + docker compose plugin must be installed on $REMOTE" >&2; exit 1; }

# rsync needs to be on both ends. Bootstrap it on the remote if missing.
# shellcheck disable=SC2086
if ! ssh $SSH_OPTS "$REMOTE" "command -v rsync >/dev/null"; then
  echo "==> Installing rsync on remote ..."
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "$REMOTE" '
    set -e
    if command -v apt-get >/dev/null; then
      DEBIAN_FRONTEND=noninteractive apt-get update -qq && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq rsync
    elif command -v dnf >/dev/null; then
      dnf install -y rsync
    elif command -v yum >/dev/null; then
      yum install -y rsync
    elif command -v apk >/dev/null; then
      apk add --no-cache rsync
    else
      echo "ERROR: no supported package manager (apt/dnf/yum/apk) found." >&2
      exit 1
    fi
  '
fi

# ---- 2) rsync sources -------------------------------------------------------
echo "==> Syncing sources to $REMOTE:$REMOTE_DIR ..."
# shellcheck disable=SC2086
ssh $SSH_OPTS "$REMOTE" "mkdir -p $REMOTE_DIR"

# We use the repo .gitignore as the exclude list, plus an explicit list for
# anything that gitignore wouldn't catch but that we still don't want shipped.
# shellcheck disable=SC2086
rsync -az --delete \
  -e "ssh $SSH_OPTS" \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='**/node_modules/' \
  --exclude='dist/' \
  --exclude='**/dist/' \
  --exclude='.nx/' \
  --exclude='**/.venv/' \
  --exclude='**/__pycache__/' \
  --exclude='**/*.tsbuildinfo' \
  --exclude='coverage/' \
  --exclude='/profiles/' \
  --exclude='/reports/' \
  --exclude='/tmp/' \
  --exclude='deploy/.env' \
  --exclude='deploy/downloads/' \
  "$REPO_ROOT/" "$REMOTE:$REMOTE_DIR/"

# ---- 3) make sure deploy/.env exists on the remote --------------------------
# shellcheck disable=SC2086
ENV_STATUS="$(ssh $SSH_OPTS "$REMOTE" "cd $REMOTE_DIR && \
  if [ -f deploy/.env ]; then echo present; \
  else cp deploy/.env.example deploy/.env && echo seeded; fi")"

if [[ "$ENV_STATUS" == "seeded" ]]; then
  cat <<EOF >&2

ERROR: First-time deploy — I just copied deploy/.env.example to deploy/.env
on the remote. SSH in and fill in real values, then re-run this script:

  ssh $REMOTE
  cd $REMOTE_DIR/deploy && \$EDITOR .env

EOF
  exit 2
fi

# ---- 4) build + (migrate) + up ---------------------------------------------
COMPOSE="docker compose --env-file deploy/.env -f $COMPOSE_FILE"

if [[ -n "$ONLY" ]]; then
  # caddy is image-only (no build context); web/api are built from this repo.
  if [[ "$ONLY" != "caddy" ]]; then
    echo "==> Building $ONLY image on remote ..."
    # shellcheck disable=SC2086
    ssh $SSH_OPTS "$REMOTE" "cd $REMOTE_DIR && $COMPOSE build $ONLY"
  fi

  echo "==> Recreating $ONLY container ..."
  # `up -d --no-deps` so we don't churn unrelated services. For caddy this also
  # picks up Caddyfile + new bind-mount changes (compose recreates when the
  # service config differs from the running container).
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "$REMOTE" "cd $REMOTE_DIR && $COMPOSE up -d --no-deps $ONLY"
else
  echo "==> Building images on remote ..."
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "$REMOTE" "cd $REMOTE_DIR && $COMPOSE build"

  echo "==> Running Liquibase migrations ..."
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "$REMOTE" "cd $REMOTE_DIR && $COMPOSE --profile migrate run --rm liquibase"

  echo "==> Bringing the stack up ..."
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "$REMOTE" "cd $REMOTE_DIR && $COMPOSE up -d --remove-orphans"
fi

echo
echo "==> Done. Service status:"
# shellcheck disable=SC2086
ssh $SSH_OPTS "$REMOTE" "cd $REMOTE_DIR && $COMPOSE ps"
