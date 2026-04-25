#!/usr/bin/env bash
# Block until a new Telegram message arrives from Gabriel (chat_id matches)
# or timeout is reached.
#
# Usage:
#   scripts/wait-for-telegram-reply.sh [--timeout 600] [--poll-interval 5]
#
# Outputs the message text to stdout on success.
# Exits 0 on reply, 124 on timeout.
#
# Tracks the last seen update_id in /tmp/telegram-last-update-id-<bot>.txt so
# repeat invocations don't re-emit old messages.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN must be set}"
: "${TELEGRAM_CHAT_ID:?TELEGRAM_CHAT_ID must be set}"

TIMEOUT=600
POLL_INTERVAL=5

while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --poll-interval) POLL_INTERVAL="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

BOT_HASH=$(echo -n "$TELEGRAM_BOT_TOKEN" | shasum | cut -c1-8)
STATE_FILE="/tmp/telegram-last-update-id-${BOT_HASH}.txt"
LAST_UPDATE_ID=0
if [[ -f "$STATE_FILE" ]]; then
  LAST_UPDATE_ID=$(cat "$STATE_FILE")
fi

START_TIME=$(date +%s)

while true; do
  ELAPSED=$(( $(date +%s) - START_TIME ))
  if [[ $ELAPSED -ge $TIMEOUT ]]; then
    echo "TIMEOUT after ${TIMEOUT}s — no reply from Gabriel" >&2
    exit 124
  fi

  OFFSET=$((LAST_UPDATE_ID + 1))
  RESPONSE=$(curl -sS \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${OFFSET}&timeout=0")

  # Find first message from our chat_id
  MATCH=$(echo "$RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not data.get('ok'):
    sys.exit(0)
target_chat = ${TELEGRAM_CHAT_ID}
for upd in data.get('result', []):
    msg = upd.get('message') or upd.get('edited_message')
    if not msg:
        continue
    if msg.get('chat', {}).get('id') != target_chat:
        continue
    text = msg.get('text', '')
    print(f\"{upd['update_id']}|||{text}\")
    break
")

  if [[ -n "$MATCH" ]]; then
    UPDATE_ID="${MATCH%%|||*}"
    TEXT="${MATCH#*|||}"
    echo "$UPDATE_ID" > "$STATE_FILE"
    printf '%s\n' "$TEXT"
    exit 0
  fi

  sleep "$POLL_INTERVAL"
done
