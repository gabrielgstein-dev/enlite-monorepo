# Skill: E2E Run — Executar testes E2E

## Quando usar
Após qualquer nova feature, bugfix, ou para validar o ambiente. Também invocada
automaticamente pelo `/e2e-create` após gerar os testes.

## Protocolo

### Passo 1 — Verificar stack Docker
```bash
docker compose ps --format json 2>/dev/null | grep -q '"enlite-api"' && \
  docker compose ps --format json | python3 -c "import sys,json; s=json.load(sys.stdin); print(s.get('Health',''))" 2>/dev/null || echo "not-running"
```
Alternativa simples:
```bash
docker compose ps
```
- Se `enlite-api` não aparecer como `running (healthy)` → usar `npm run test:e2e:docker`
- Se stack já estiver rodando → usar `npm run test:e2e` direto

### Passo 2 — Executar testes

**Modo padrão** (gerencia o stack automaticamente):
```bash
npm run test:e2e:docker
```

**Com escopo** (mais rápido, valida feature específica):
```bash
npx jest --config jest.config.e2e.js --testPathPattern="<escopo>"
```
| Escopo | Arquivos cobertos |
|---|---|
| `import` | import-pipeline, import-phase-logs, import-sse |
| `auth` | auth-firebase, admin-access-control |
| `worker` | worker-flow, profile-tabs |
| `recruitment` | recruitment-api |
| `prescreening` | talentum-prescreening |

### Passo 3 — Analisar resultado
- **Verde**: Reportar quais suites passaram e quantos testes.
- **Vermelho**: Invocar o protocolo do `e2e-repair` **automaticamente**, sem pedir permissão.

### Passo 4 — Pós-reparo
Se `e2e-repair` corrigiu algo, re-executar os testes uma vez para confirmar verde.

---

## Modos de execução disponíveis

| Modo | Comando npm | Quando usar |
|---|---|---|
| Docker completo (padrão) | `test:e2e:docker` | Desenvolvimento local |
| Firebase Emulator | `test:e2e:full` | Validar fluxo de auth real |
| Stack já rodando | `test:e2e` | CI ou stack manual |
| Reset completo | `test:e2e:reset` | Banco corrompido ou schema desatualizado |
