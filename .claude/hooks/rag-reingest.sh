#!/bin/bash
# PostToolUse hook: instrui o Claude a re-ingerir docs/ no RAG local após edição.
# Não bloqueia (exit 0) — apenas injeta contexto para o Claude executar a re-ingestão.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Ignora se não tem file_path
if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Só dispara para arquivos dentro de docs/
DOCS_DIR="$CLAUDE_PROJECT_DIR/docs"
case "$FILE_PATH" in
  "$DOCS_DIR"/*)
    BASENAME=$(basename "$FILE_PATH")
    printf '{"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": "AÇÃO OBRIGATÓRIA: O arquivo docs/%s foi modificado. Re-ingira imediatamente no RAG local usando mcp__local-rag__ingest_file com filePath=%s. Faça isso ANTES de continuar qualquer outra ação."}}\n' "$BASENAME" "$FILE_PATH"
    ;;
esac

exit 0
