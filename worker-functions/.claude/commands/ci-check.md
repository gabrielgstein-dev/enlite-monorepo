# Skill: CI Check — Validação Completa + Commit & Push

## Quando usar
Quando quiser validar o estado dos dois projetos (unit tests, E2E, build) e, se
tudo passar, commitar e pushar as mudanças. Aceita mensagem de commit como argumento:
`/ci-check "feat: minha feature"` — se omitida, perguntar ao usuário antes do commit.

## Projetos

| Variável | Valor |
|----------|-------|
| `WF` | `/Users/gabrielstein-dev/projects/enlite/worker-functions` |
| `FE` | `/Users/gabrielstein-dev/projects/enlite/enlite-frontend` |

---

## Protocolo

### Fase 1 — Worker Functions

#### 1.1 Unit Tests
```bash
cd /Users/gabrielstein-dev/projects/enlite/worker-functions && \
  npm test -- --forceExit --passWithNoTests 2>&1
```
- Framework: **Jest**
- Linha de resumo: `Tests: X failed, Y passed, Z total` (ou `Test Suites` se não houver testes)
- Extrair: `total`, `passed`, `failed`

#### 1.2 E2E Tests (Docker)
```bash
cd /Users/gabrielstein-dev/projects/enlite/worker-functions && \
  npm run test:e2e:docker 2>&1
```
- Framework: **Jest + Supertest** rodando em Docker
- Pode demorar até 3 minutos — aguardar o processo terminar completamente
- Linha de resumo: mesmo formato Jest acima
- Se o Docker não estiver disponível: registrar como `⚠️ SKIP — Docker indisponível`

#### 1.3 Build
```bash
cd /Users/gabrielstein-dev/projects/enlite/worker-functions && \
  npm run build 2>&1
```
- Sucesso: exit code 0 e sem linhas `error TS`
- Falha: listar as primeiras 10 linhas de erro

---

### Fase 2 — Enlite Frontend

#### 2.1 Unit Tests
```bash
cd /Users/gabrielstein-dev/projects/enlite/enlite-frontend && \
  pnpm test:run 2>&1
```
- Framework: **Vitest**
- Linha de resumo: `Tests X passed` / `X failed` ou `✓ X | × Y`
- Extrair: `total`, `passed`, `failed`

#### 2.2 E2E Tests (Playwright)
```bash
cd /Users/gabrielstein-dev/projects/enlite/enlite-frontend && \
  pnpm test:e2e 2>&1
```
- Framework: **Playwright** (Chromium, Firefox, WebKit)
- Linha de resumo: `X passed (Xs)` ou `X failed, Y passed`
- Extrair: `total` (soma de todos os browsers), `passed`, `failed`
- Se o servidor não estiver rodando (connection refused): registrar como `⚠️ SKIP — servidor não disponível`

#### 2.3 Build
```bash
cd /Users/gabrielstein-dev/projects/enlite/enlite-frontend && \
  pnpm run build 2>&1
```
- Sucesso: exit code 0 e sem linhas `error TS` / `Error:`
- Falha: listar as primeiras 10 linhas de erro

---

### Fase 3 — Relatório

Apresentar tabela com os resultados de todas as fases:

```
┌─────────────────────┬───────────┬───────┬────────┬────────┬────────┐
│ Projeto             │ Tipo      │ Total │ Passou │ Falhou │ Status │
├─────────────────────┼───────────┼───────┼────────┼────────┼────────┤
│ worker-functions    │ Unit      │   X   │   X    │   X    │ ✅/❌  │
│ worker-functions    │ E2E       │   X   │   X    │   X    │ ✅/❌/⚠️│
│ worker-functions    │ Build     │   —   │   —    │   —    │ ✅/❌  │
│ enlite-frontend     │ Unit      │   X   │   X    │   X    │ ✅/❌  │
│ enlite-frontend     │ E2E       │   X   │   X    │   X    │ ✅/❌/⚠️│
│ enlite-frontend     │ Build     │   —   │   —    │   —    │ ✅/❌  │
└─────────────────────┴───────────┴───────┴────────┴────────┴────────┘
```

Legenda: ✅ passou | ❌ falhou | ⚠️ pulado

---

### Fase 4 — Commit + Push (condicional)

**Condição para prosseguir:** todos os checks obrigatórios ✅ (E2E pode ser ⚠️ SKIP).
Checks obrigatórios: Unit Tests e Build de ambos os projetos.

#### 4.1 Se houver falhas obrigatórias
- **NÃO commitar nem pushar**
- Listar exatamente quais checks falharam
- Sugestões de remediação:
  - E2E: invocar `/e2e-repair`
  - Build: mostrar erros tsc completos
  - Unit: mostrar nome dos testes que falharam

#### 4.2 Se todos os checks obrigatórios passaram

Verificar mudanças em cada projeto:
```bash
git -C /Users/gabrielstein-dev/projects/enlite/worker-functions status --short
git -C /Users/gabrielstein-dev/projects/enlite/enlite-frontend status --short
```

Se não houver mudanças em nenhum projeto: informar "Nada a commitar em nenhum projeto."

Se houver mudanças:
1. Se a mensagem de commit foi passada como argumento (`$ARGUMENTS`), usá-la diretamente.
   Senão, perguntar ao usuário: "Qual a mensagem de commit?"
2. Para cada projeto com mudanças:
   ```bash
   git -C <projeto> add -A
   git -C <projeto> commit -m "<mensagem>"
   git -C <projeto> push
   ```
3. Confirmar: mostrar o hash do commit e o resultado do push.

> **Segurança:** nunca usar `--no-verify`, nunca fazer force-push. Se o push rejeitar,
> reportar o erro e perguntar ao usuário como proceder.
