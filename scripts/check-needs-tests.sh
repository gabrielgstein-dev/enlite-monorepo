#!/bin/bash
# Stop hook: detecta feature implementada sem testes E2E correspondentes.
# Saída DEVE ser JSON. Texto puro é ignorado pelo Claude Code.
# "continue: false" impede o stop e injeta o contexto no próximo turno de Claude.

MODIFIED=$(git diff HEAD --name-only 2>/dev/null)
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null)
ALL_CHANGED=$(printf '%s\n%s\n' "$MODIFIED" "$UNTRACKED" | grep -v '^$' | sort -u)

HAS_FEATURE=$(echo "$ALL_CHANGED" | grep -E \
  "^src/interfaces/controllers/|^src/interfaces/routes/|^src/application/|^src/infrastructure/converters/" \
  2>/dev/null | head -1)

HAS_TESTS=$(echo "$ALL_CHANGED" | grep -E "^tests/e2e/.*\.test\.ts$" 2>/dev/null | head -1)

if [ -n "$HAS_FEATURE" ] && [ -z "$HAS_TESTS" ]; then
  CHANGED_FILES=$(echo "$ALL_CHANGED" | grep -E \
    "^src/interfaces/controllers/|^src/interfaces/routes/|^src/application/|^src/infrastructure/converters/" \
    2>/dev/null | head -4 | tr '\n' ', ' | sed 's/,$//')
  printf '{"continue": false, "hookSpecificOutput": {"hookEventName": "Stop", "additionalContext": "Arquivos de feature modificados sem testes E2E: %s. Execute /e2e-create para criar os testes antes de finalizar."}}\n' "$CHANGED_FILES"
fi
