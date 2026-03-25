# Enlite Worker Functions — Guia para Claude

> Referência completa: `docs/IMPLEMENTATION_RULES.md`

---

## Projeto

Backend de recrutamento de profissionais de saúde. Gerencia workers, vagas, encuadres (entrevistas) e matchmaking.
Importa dados de 4 fontes: **Talentum**, **ClickUp**, **Planilla Operativa** e **Ana Care** — via CLI ou endpoint HTTP.

---

## Arquitetura (camadas, do mais interno ao mais externo)

```
domain/          → entidades, interfaces (IRepository, IFileConverter, ports)
application/     → use cases
infrastructure/  → repositórios, serviços, converters, scripts
interfaces/      → controllers HTTP, rotas
scripts/         → entrypoints CLI (finos, sem lógica de negócio)
```

---

## Regras críticas — SEMPRE ativas

### Import Pipeline

- **Cada fonte de dados tem seu próprio Converter** em `src/infrastructure/converters/`.
  Fontes existentes: `TalentumConverter`, `ClickUpConverter`, `PlanilhaOperativaConverter`, `AnaCareConverter`.
- **`PlanilhaImporter` é apenas orquestrador**: detecta tipo → instancia Converter → persiste. Nunca parseia colunas ou normaliza valores inline.
- **Detecção de tipo (`canHandle()`) fica no Converter**, nunca em `if/else` no Importer.
- **CLI e HTTP usam o mesmo `importBuffer()`**. O único ponto de divergência é `onProgress`.
- **Arquivos em `scripts/` têm no máximo 80 linhas** e zero lógica de negócio.

### Normalização

- **Toda normalização vive em `import-utils.ts`**. Nunca inline em Converters ou repositórios.
- Funções de normalização são **puras** (sem IO, sem efeitos colaterais).
- Falha de normalização retorna `null` + log de aviso. **Nunca lança exceção**.

### Repositórios

- **Um arquivo por repositório**. `OperationalRepositories.ts` é legado — não adicionar classes novas lá.
- Repositórios recebem DTOs já normalizados. **Nunca normalizam dados internamente**.
- Todo `ON CONFLICT ... DO UPDATE` tem **comentário explicando a estratégia** de cada campo (sobrescreve / COALESCE / condicional).
- `upsert()` sempre retorna `{ entity, created: boolean }`.

### LLM

- **LLM nunca é chamado no path síncrono de import**. Sempre em background após o upsert.
- Todo serviço LLM tem `RATE_LIMIT_MS` como constante nomeada.
- Campos `llm_*` são sempre `nullable`. O sistema nunca falha por ausência de enriquecimento.
- Prompts LLM são **constantes nomeadas** no topo do arquivo, nunca strings inline.

### Organização

- **Máximo 400 linhas por arquivo** de implementação. Acima disso, a classe está fazendo coisas demais.
- Rotas HTTP vivem em `src/interfaces/routes/`, não em `src/index.ts`.
- Controllers não contêm lógica de negócio.

### Banco

- Toda `import_job` é criada antes do import começar (CLI ou HTTP).
- Erros de linha **nunca param o import** — são acumulados em `ImportJob.errorDetails`.
- Migração = uma mudança lógica. Nunca agrupar alterações não relacionadas.
- Colunas `llm_*` novas sempre têm migração própria com `DEFAULT NULL`.

---

## Quando usar os comandos slash

| Situação | Comando |
|---|---|
| Adicionar nova fonte de dados (nova planilha) | `/new-converter` |
| Modificar qualquer arquivo em `scripts/`, `infrastructure/scripts/`, `infrastructure/converters/` | `/import-checklist` |
| Criar ou alterar migração de banco | `/new-migration` |
| Revisar ou refatorar código de import | `/review-import` |

---

## Sequência obrigatória pós-import

Após qualquer import em lote, sempre executar nessa ordem:

```typescript
await encuadreRepo.linkWorkersByPhone();          // 1. Liga encuadres a workers
await blacklistRepo.linkWorkersByPhone();          // 2. Liga blacklist a workers
await encuadreRepo.syncToWorkerJobApplications(); // 3. Sincroniza tabela canônica
```

---

## Padrão de resposta HTTP para imports

- `POST /api/import/upload` → sempre `202 Accepted` com `{ importJobId, statusUrl }`
- `GET /api/import/status/:id` → status do `ImportJob`
- Nunca aguardar o processamento completo antes de responder.
