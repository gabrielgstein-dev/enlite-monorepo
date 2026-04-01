# Enlite Worker Functions — Guia para Claude

Backend Node.js/Express/TypeScript/PostgreSQL que gerencia o ciclo de vida de Acompanhantes Terapêuticos (ATs): importação de dados, recrutamento, matching e operação diária.

---

## Documentação de referência

| O que precisa | Onde ler |
|---|---|
| Arquitetura completa, schema do banco, roles, auth | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Regras detalhadas do pipeline de importação | [`docs/IMPLEMENTATION_RULES.md`](docs/IMPLEMENTATION_RULES.md) |
| Setup de banco e comandos SQL | [`docs/COMANDOS_CONFIGURACAO_DB.md`](docs/COMANDOS_CONFIGURACAO_DB.md) |

**Antes de qualquer mudança em schema, roles, auth ou pipeline de import: leia `docs/ARCHITECTURE.md`.**

---

## Regras que nunca mudam

- Máximo **400 linhas** por arquivo de implementação
- Controllers não contêm lógica de negócio
- Toda normalização em `import-utils.ts` — nunca inline
- LLM nunca no path síncrono — sempre background
- Migrações são aditivas: nunca dropar coluna/tabela sem deprecação
- Testes de repositório usam banco real — nunca mock

---

## Testes E2E — obrigatório

Toda vez que um controller, route, use case ou converter for criado ou modificado: criar/atualizar o teste E2E antes de considerar a tarefa concluída.

```
1. Implementar feature
2. /e2e-create  → gera/atualiza teste E2E
3. /e2e-run     → executa (Docker se necessário, auto-repair se falhar)
```

| Modo | Comando |
|---|---|
| Docker completo (padrão local) | `npm run test:e2e:docker` |
| Firebase Emulator | `npm run test:e2e:full` |
| Stack já rodando (CI) | `npm run test:e2e` |

---

## Sequência obrigatória pós-import

```typescript
await encuadreRepo.linkWorkersByPhone();
await blacklistRepo.linkWorkersByPhone();
await encuadreRepo.syncToWorkerJobApplications();
```

---

## Comandos slash

| Situação | Comando |
|---|---|
| Nova fonte de dados | `/new-converter` |
| Mudança em scripts/, converters/ | `/import-checklist` |
| Nova migração de banco | `/new-migration` |
| Feature nova pronta | `/e2e-create` → `/e2e-run` |
| Testes falhando | `/e2e-repair` |
