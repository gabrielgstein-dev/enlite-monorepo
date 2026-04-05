#!/bin/bash
# PreToolUse hook: bloqueia escrita de migrations com DROP/DELETE destrutivo sem padrão de deprecação.
# Regra: nunca dropar coluna/tabela sem renomear para _deprecated_YYYYMMDD primeiro.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Só valida arquivos de migration
if ! echo "$FILE_PATH" | grep -q "migrations/.*\.sql"; then
  exit 0
fi

CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // empty')

# Ignora se não tem conteúdo (ex: Read)
if [ -z "$CONTENT" ]; then
  exit 0
fi

# Detecta operações destrutivas
HAS_DROP=$(echo "$CONTENT" | grep -iE "DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)" | grep -iv "_deprecated_" | head -1)
HAS_DELETE=$(echo "$CONTENT" | grep -iE "DELETE\s+FROM" | grep -iv "schema_migrations" | head -1)
HAS_TRUNCATE=$(echo "$CONTENT" | grep -iE "TRUNCATE" | head -1)

if [ -n "$HAS_DROP" ] || [ -n "$HAS_DELETE" ] || [ -n "$HAS_TRUNCATE" ]; then
  echo "Migration bloqueada: operação destrutiva detectada sem padrão de deprecação." >&2
  echo "Regra: renomear para _deprecated_YYYYMMDD antes de dropar. DELETE/TRUNCATE requer justificativa." >&2
  echo "Operação encontrada: ${HAS_DROP}${HAS_DELETE}${HAS_TRUNCATE}" >&2
  exit 2
fi

exit 0
