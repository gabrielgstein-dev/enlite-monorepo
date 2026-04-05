#!/bin/bash
# PostToolUse hook: avisa quando arquivo editado/escrito ultrapassa 400 linhas.
# Não bloqueia (exit 0) — apenas injeta contexto para o Claude corrigir.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Ignora se não tem file_path (ex: Bash tool)
if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Só verifica arquivos de implementação (não testes, configs, migrations, docs)
case "$FILE_PATH" in
  *.test.ts|*.test.tsx|*.spec.ts|*.e2e.ts|*.sql|*.json|*.md|*.css|*.html)
    exit 0
    ;;
esac

LINE_COUNT=$(wc -l < "$FILE_PATH" | tr -d ' ')

if [ "$LINE_COUNT" -gt 400 ]; then
  BASENAME=$(basename "$FILE_PATH")
  printf '{"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": "ALERTA: %s tem %s linhas (limite: 400). Extraia lógica para subcomponentes ou arquivos auxiliares antes de continuar."}}\n' "$BASENAME" "$LINE_COUNT"
fi

exit 0
