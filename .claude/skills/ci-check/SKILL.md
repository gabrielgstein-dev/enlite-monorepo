---
name: ci-check
description: Roda unit tests, E2E, build nos dois projetos e faz commit+push se tudo passar.
model: haiku
---

# CI Check — Validação Completa + Commit & Push

Aceita mensagem de commit como argumento (`$ARGUMENTS`). Se omitida, perguntar antes do commit.

## Projetos
- `WF` = `/Users/gabrielstein-dev/projects/enlite/worker-functions`
- `FE` = `/Users/gabrielstein-dev/projects/enlite/enlite-frontend`

---

## Fase 1 — Worker Functions

### 1.1 Unit Tests
```bash
cd /Users/gabrielstein-dev/projects/enlite/worker-functions && npm test -- --forceExit --passWithNoTests 2>&1
```
Extrair da linha `Tests: X failed, Y passed, Z total`.

### 1.2 E2E Tests
```bash
cd /Users/gabrielstein-dev/projects/enlite/worker-functions && npm run test:e2e:docker 2>&1
```
Mesmo formato Jest. Se Docker indisponível: `⚠️ SKIP`.

### 1.3 Build
```bash
cd /Users/gabrielstein-dev/projects/enlite/worker-functions && npm run build 2>&1
```
Sucesso = exit 0 sem linhas `error TS`.

---

## Fase 2 — Enlite Frontend

### 2.1 Unit Tests
```bash
cd /Users/gabrielstein-dev/projects/enlite/enlite-frontend && pnpm test:run 2>&1
```
Extrair `X passed` / `X failed` do output Vitest.

### 2.2 E2E Tests
```bash
cd /Users/gabrielstein-dev/projects/enlite/enlite-frontend && pnpm test:e2e 2>&1
```
Formato Playwright: `X passed, Y failed`. Se servidor indisponível: `⚠️ SKIP`.

### 2.3 Build
```bash
cd /Users/gabrielstein-dev/projects/enlite/enlite-frontend && pnpm run build 2>&1
```

---

## Fase 3 — Relatório

| Projeto          | Tipo  | Total | Passou | Falhou | Status    |
|------------------|-------|-------|--------|--------|-----------|
| worker-functions | Unit  |       |        |        | ✅/❌     |
| worker-functions | E2E   |       |        |        | ✅/❌/⚠️ |
| worker-functions | Build |  —    |  —     |  —     | ✅/❌     |
| enlite-frontend  | Unit  |       |        |        | ✅/❌     |
| enlite-frontend  | E2E   |       |        |        | ✅/❌/⚠️ |
| enlite-frontend  | Build |  —    |  —     |  —     | ✅/❌     |

---

## Fase 4 — Commit + Push

**Só executar se Unit Tests e Build de ambos os projetos estão ✅.**

Se houver falhas obrigatórias: listar o que falhou, NÃO commitar.

Se tudo ok:
1. Checar mudanças:
   ```bash
   git -C /Users/gabrielstein-dev/projects/enlite/worker-functions status --short
   git -C /Users/gabrielstein-dev/projects/enlite/enlite-frontend status --short
   ```
2. Se `$ARGUMENTS` vazio: perguntar a mensagem ao usuário.
3. Para cada projeto com mudanças:
   ```bash
   git -C <projeto> add -A
   git -C <projeto> commit -m "<mensagem>"
   git -C <projeto> push
   ```
4. Mostrar hash do commit e resultado do push.

> Nunca usar `--no-verify` nem force-push.
