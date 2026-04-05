# /new-migration — Criar ou alterar migração de banco de dados

Usado quando: **qualquer alteração no schema** do banco de dados for necessária.

---

## Regras antes de escrever SQL

1. **Uma migration = uma mudança lógica**
   - Certo: `055_add_xyz_status_to_workers.sql`
   - Errado: `055_add_xyz_status_and_fix_phone_and_add_index.sql`

2. **Migrações são sempre aditivas por padrão**
   - Nunca dropar coluna ou tabela em produção diretamente
   - Para remover: primeiro renomear para `_deprecated_YYYYMMDD`, depois dropar em migration futura

3. **Número sequencial** — verificar o último número em `migrations/` antes de criar:
   ```bash
   ls migrations/ | sort | tail -5
   ```

---

## Templates por tipo de mudança

### Adicionar coluna simples

```sql
-- migrations/055_add_xyz_to_workers.sql

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS xyz VARCHAR(50) DEFAULT NULL;

COMMENT ON COLUMN workers.xyz IS 'Descrição do que esse campo armazena e de onde vem';
```

### Adicionar coluna LLM (obrigatório para campos `llm_*`)

```sql
-- migrations/055_add_llm_xyz_to_job_postings.sql

ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS llm_xyz JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS llm_xyz_processed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN job_postings.llm_xyz IS
  'Extraído pelo LLM de worker_profile_sought. Estrutura: { field: string[] }';
COMMENT ON COLUMN job_postings.llm_xyz_processed_at IS
  'NULL = ainda não processado. Set to NULL to force reprocessing.';
```

### Adicionar index

```sql
-- migrations/055_add_index_workers_phone.sql

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workers_phone
  ON workers (phone)
  WHERE phone IS NOT NULL;
-- CONCURRENTLY evita lock na tabela em produção
```

### Alterar tipo de coluna

```sql
-- migrations/055_increase_status_field_length.sql

-- Verificar uso atual antes de alterar:
-- SELECT MAX(LENGTH(status)) FROM workers;

ALTER TABLE workers
  ALTER COLUMN status TYPE VARCHAR(100);
-- Era VARCHAR(50), aumentado para acomodar novos valores de status
```

### Adicionar novo valor a status (CHECK constraint)

Preferir VARCHAR com CHECK constraint a ENUM nativo do Postgres:

```sql
-- migrations/055_add_not_qualified_status.sql

ALTER TABLE workers
  DROP CONSTRAINT IF EXISTS workers_overall_status_check;

ALTER TABLE workers
  ADD CONSTRAINT workers_overall_status_check
  CHECK (overall_status IN (
    'ACTIVE', 'INACTIVE', 'PENDING', 'NOT_QUALIFIED'
  ));
```

### Deprecar coluna (nunca dropar diretamente)

```sql
-- migrations/055_deprecate_old_column.sql

-- Passo 1: renomear (nesta migration)
ALTER TABLE workers
  RENAME COLUMN old_column TO old_column_deprecated_20260325;

-- Passo 2: dropar em migration futura, após confirmar que nada mais usa
```

---

## Checklist de criação

- [ ] Número sequencial verificado (`ls migrations/ | sort | tail -5`)
- [ ] Nome do arquivo descreve a mudança (`NNN_verbo_campo_tabela.sql`)
- [ ] `ADD COLUMN IF NOT EXISTS` (idempotente)
- [ ] Novos campos têm `DEFAULT NULL` se opcionais
- [ ] `COMMENT ON COLUMN` para campos não óbvios
- [ ] Campos `llm_*` têm coluna `_processed_at` correspondente
- [ ] Indexes usam `CONCURRENTLY`
- [ ] Migration executada em desenvolvimento antes do commit

## Após criar a migration

Atualizar em cascata:
- [ ] Interface da entidade em `src/domain/entities/`
- [ ] Método `mapRow()` no repositório correspondente
- [ ] DTO do Converter se o campo vem de planilha
- [ ] Estratégia de `ON CONFLICT` no repositório (com comentário)
