#!/usr/bin/env bash
# Send a message to Gabriel via Telegram bot @ClaudeAsker_bot.
#
# Usage:
#   scripts/ask-telegram.sh "Sua mensagem aqui"
#   echo "mensagem" | scripts/ask-telegram.sh
#
# Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from .env.local at the repo root.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Telegram bot is not configured." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN must be set in .env.local}"
: "${TELEGRAM_CHAT_ID:?TELEGRAM_CHAT_ID must be set in .env.local}"

if [[ $# -gt 0 ]]; then
  MESSAGE="$*"
else
  MESSAGE="$(cat)"
fi

if [[ -z "${MESSAGE// }" ]]; then
  echo "ERROR: empty message" >&2
  exit 1
fi

RESPONSE=$(curl -sS -X POST \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=${MESSAGE}" \
  --data-urlencode "parse_mode=Markdown")

if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "✓ message sent to Telegram"
else
  echo "ERROR: Telegram API rejected the message:" >&2
  echo "$RESPONSE" >&2
  exit 1
fi
