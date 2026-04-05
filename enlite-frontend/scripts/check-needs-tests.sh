#!/bin/bash
# Stop hook: detecta componentes/páginas modificados sem testes correspondentes.
# Saída DEVE ser JSON. exit 0 sem output = permite stop normalmente.

MODIFIED=$(git diff HEAD --name-only 2>/dev/null)
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null)
ALL_CHANGED=$(printf '%s\n%s\n' "$MODIFIED" "$UNTRACKED" | grep -v '^$' | sort -u)

# Filtra apenas arquivos do frontend
FRONTEND_CHANGED=$(echo "$ALL_CHANGED" | grep "^enlite-frontend/" | sed 's|^enlite-frontend/||')

HAS_FEATURE=$(echo "$FRONTEND_CHANGED" | grep -E \
  "^src/presentation/|^src/application/|^src/infrastructure/" \
  2>/dev/null | grep -v '\.test\.' | head -1)

HAS_TESTS=$(echo "$FRONTEND_CHANGED" | grep -E "\.test\.(ts|tsx)$|^e2e/.*\.e2e\.ts$" 2>/dev/null | head -1)

if [ -n "$HAS_FEATURE" ] && [ -z "$HAS_TESTS" ]; then
  CHANGED_FILES=$(echo "$FRONTEND_CHANGED" | grep -E \
    "^src/presentation/|^src/application/|^src/infrastructure/" \
    2>/dev/null | grep -v '\.test\.' | head -4 | tr '\n' ', ' | sed 's/,$//')
  printf '{"continue": false, "hookSpecificOutput": {"hookEventName": "Stop", "additionalContext": "Arquivos de feature frontend modificados sem testes: %s. Crie testes unitários co-locados e/ou E2E com screenshot assertion (toHaveScreenshot) antes de finalizar."}}\n' "$CHANGED_FILES"
fi
