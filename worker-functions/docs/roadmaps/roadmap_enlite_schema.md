# Enlite Health — Roadmap de Correção de Schema

> **Banco:** enlite_ar (Cloud SQL PostgreSQL)
> **Total de achados:** 28 (5 Criticos · 9 Normalização · 11 Design/Consistência · 3 Infraestrutura)
> **Ultima auditoria:** 2026-03-29 (2a revisão rigorosa)
> **Progresso:** 25 completos · 2 com gap de codigo · 1 parcial por design
> **Gaps restantes:** Ver `roadmap_schema_gaps.md` para passo a passo de resolução

## Ordem de prioridade de execução

| Prioridade | ID   | Status | Titulo | Migration |
|-----------|------|--------|--------|-----------|
| 1  | C1   | COMPLETO | FK quebrada em `worker_job_applications` | 011 (FK ja existia) |
| 2  | C2   | COMPLETO | `encuadres.worker_email` em plaintext | 071 |
| 3  | C2-B | COMPLETO | `patient_professionals.email` e `phone` em plaintext | 071 |
| 4  | C2-D | COMPLETO | `workers.whatsapp_phone` é plaintext — escapou da migration 023 | 071 |
| 5  | C3   | COMPLETO | `coordinator_name` varchar em 4 tabelas sem FK — repos migrados | 072 |
| 7  | D4   | COMPLETO | `patients.country` é `text` sem constraint | 069 |
| 8  | D4-B | COMPLETO | `worker_locations.country` é `text` sem constraint | 069 |
| 8  | D5   | PARCIAL (por design) | `workers` não tem FK para `users` | 074 (view de monitoramento) |
| 9  | N1   | COMPLETO | `profession` vs `occupation` — enums alinhados banco + TS | 076 |
| 10 | N2   | COMPLETO | `linkedin_url` duplicado | 071 |
| 11 | N3   | COMPLETO | `patients` tem campos de localização inline + `patient_addresses` | 083 |
| 12 | N8-C | PARCIAL | `blacklist` — repo OK, `WorkerDeduplicationService` copia plaintext | 089 |
| 13 | D1   | COMPLETO | Duas tabelas de localização com padrões diferentes | 084 |
| 14 | D3   | COMPLETO | `job_postings.assignee` é text | 073 |
| 15 | D3-B | COMPLETO | `publications.recruiter_name` é text sem FK | 073 |
| 16 | N4   | COMPLETO | `job_postings` com 60+ colunas + `dependency_level` e `case_number` duplicados | 080+081+082 |
| 17 | N5   | COMPLETO | `workers` — view `worker_eligibility` integrada no MatchmakingService | 077 |
| 18 | N6   | COMPLETO | `application_status` vs `application_funnel_stage` mapeados | 078 |
| 19 | N7   | COMPLETO | `blacklist` permite entradas órfãs duplicadas | 070 |
| 20 | N8   | COMPLETO | Campos `_raw` com COMMENTs + politica documentada | 090 |
| 21 | D2   | COMPLETO | `messaging_outbox` vs `whatsapp_bulk_dispatch_logs` vs `messaged_at` | 085 |
| 22 | D6   | PARCIAL | RecruitmentController OK, ~20 queries em outros arquivos sem `deleted_at` | 075 |
| 23 | D7   | COMPLETO | `worker_status_history` tabela + trigger + `SET LOCAL` no codigo | 079 |
| 24 | D8   | COMPLETO | `messaging_variable_tokens` + `TokenService` integrado no `OutboxProcessor` | 086 |
| 25 | D9   | COMPLETO | Estratégia de retenção de dados com functions | 087 |
| 26 | I1   | COMPLETO | Tabelas Talentum com trigger `updated_at` | 067 |
| 27 | I2   | COMPLETO | `patient_addresses`, `patient_professionals` e `publications` com `updated_at` | 068 |
| 28 | I3   | COMPLETO | `job_postings.current_applicants` removido, `get_applicant_count()` criada | 088 |

---

## Gaps pendentes de resolução (2 restantes)

> Verificação de 2026-03-30. GAPs 2 (N5) e 3 (C3) resolvidos. GAPs 1 (D6) e 4 (N8-C) parcialmente resolvidos.

### GAP 1 — D6: ~20 queries em 8 arquivos sem filtro `deleted_at IS NULL` (CRITICA)

**Severidade: CRITICA — queries retornam job_postings soft-deleted**

O `RecruitmentController.ts` foi corrigido (8/9 metodos). Restam ~20 queries em outros arquivos:

| Arquivo | Queries |
|---|---|
| `VacanciesController.ts` | 5 |
| `MatchmakingService.ts` | 3 (subqueries de active_cases no hardFilter + loadAndEnrichJob) |
| `JobPostingEnrichmentService.ts` | 2 |
| `AnalyticsRepository.ts` | 4 |
| `EncuadreRepository.ts` | 3 |
| `ClickUpCaseRepository.ts` | 2 |
| `OperationalRepositories.ts` | 4 |
| `TalentumWebhookController.ts` | 1 |
| `RecruitmentController.ts` | 1 (`getTalentumWorkers` LEFT JOIN) |

### GAP 4 residual — N8-C: `WorkerDeduplicationService` copia blacklist sem colunas encrypted (ALTA)

**Severidade: ALTA — merge de workers perde criptografia**

O `BlacklistRepository` foi corrigido (KMS injetado, encrypt/decrypt funcional). Porem o `WorkerDeduplicationService.ts` (~linhas 414-420) faz INSERT direto copiando apenas `reason`/`detail` plaintext sem `reason_encrypted`/`detail_encrypted`.

**Ação:** Adicionar `reason_encrypted, detail_encrypted` no SELECT/INSERT da query de relinking.

> **Passo a passo detalhado:** ver `docs/roadmaps/roadmap_schema_gaps.md`

---

## 🔴 Seção 1 — Itens Críticos

Bugs ativos, riscos regulatórios (HIPAA/LGPD) ou entidades faltando que causam dados inconsistentes. **Executar com prioridade máxima.**

> **Status da seção:** 5/5 completos (C1, C2, C2-B, C2-D, C3). Migrations 011, 071, 072.

---

## C1 — ~~🔴 CRÍTICO (Bug)~~ COMPLETO: FK quebrada em `worker_job_applications`

> **Resolvido em:** Migration 011 (FK ja existia desde a criação da tabela). Confirmado via query em `pg_constraint`. Problema era artefato do export DBeaver.
> **Testes:** `tests/e2e/wave1-schema-diagnostic.test.ts`

### Problema

O DDL exportado contém `REFERENCES <?>()` na foreign key de `worker_id`. Isso indica corrupção de metadado ou artefato do export. Se real, INSERT sem worker válido pode ser aceito silenciosamente pelo banco, corrompendo dados de candidatura.

### Passo a passo de implementação

1. Conectar ao banco de produção (`enlite_ar`) com psql ou DBeaver.

2. Executar a query de diagnóstico:

```sql
SELECT conname,
       conrelid::regclass  AS tabela,
       confrelid::regclass AS referencia_para,
       pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE contype = 'f'
  AND conrelid = 'worker_job_applications'::regclass;
```

3. Verificar se `worker_id` aparece com `confrelid = workers`. Se sim, o banco está íntegro — o problema foi só no export do DBeaver (encerrar aqui).

4. Se a FK estiver ausente ou inválida no banco:

   a. Verificar órfãos:
   ```sql
   SELECT COUNT(*) FROM worker_job_applications
   WHERE worker_id NOT IN (SELECT id FROM workers);
   ```

   b. Deletar ou corrigir órfãos antes de adicionar a FK.

   c. Criar a migration:
   ```sql
   ALTER TABLE worker_job_applications
     ADD CONSTRAINT wja_worker_id_fkey
     FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE;
   ```

   d. Aplicar via sistema de migrations (`schema_migrations`).

5. Re-exportar o DDL pelo DBeaver e confirmar que a FK aparece corretamente, sem placeholder `<?>`.

### Critérios de aceite

- [ ] A query em `pg_constraint` retorna exatamente 1 linha para `worker_id` com `confrelid = workers`.
- [ ] Tentativa de INSERT com `worker_id` inexistente retorna `ForeignKeyViolation`.
- [ ] A migration está registrada em `schema_migrations`.
- [ ] O DDL re-exportado mostra `REFERENCES public.workers(id)` sem placeholder.

### Testes unitários — validar implementação

- `test("FK válida: INSERT com worker_id inexistente deve falhar")` — inserir registro com UUID aleatório como `worker_id` e esperar `ForeignKeyViolation`.
- `test("FK válida: INSERT com worker_id válido deve ter sucesso")` — criar worker, criar job_posting, inserir application com os IDs corretos.
- `test("CASCADE: deletar worker deve remover suas applications")` — criar worker + application, deletar worker, verificar que application não existe mais.
- `test("pg_constraint confirma FK")` — query direta em `pg_constraint` validando `confrelid = workers::oid`.

### Testes de regressão — garantir que não volta

- `test("Migration idempotente")` — rodar a migration duas vezes não deve gerar erro.
- `test("DDL snapshot")` — snapshot do DDL de `worker_job_applications` deve conter `REFERENCES public.workers(id)` e não conter `<?>`. Rodar em CI a cada migration.
- `test("Nenhum worker_id NULL em worker_job_applications")` — query de integridade executada em jobs de saúde diários.

---

## C2 — ~~🔴 CRÍTICO (HIPAA / LGPD)~~ COMPLETO: `encuadres.worker_email` em plaintext

> **Resolvido em:** Migration 071 (`071_wave3_pii_encryption.sql`). Coluna `worker_email` dropada, `worker_email_encrypted` criada. KMS integrado no `EncuadreRepository.ts`.
> **Testes:** `tests/e2e/wave3-pii-encryption.test.ts`

### Problema

Todos os campos PII de workers usam KMS (`_encrypted`), mas `encuadres.worker_email` é `varchar(255)` em plaintext. Encuadres guardam dados de entrevistas clínicas e são auditáveis por reguladores. Viola a política de criptografia do Enlite e representa risco regulatório real (HIPAA, PDPA Argentina).

### Passo a passo de implementação

1. Criar a migration de schema:

```sql
ALTER TABLE encuadres
  ADD COLUMN worker_email_encrypted TEXT NULL;

COMMENT ON COLUMN encuadres.worker_email_encrypted
  IS 'Email do worker — KMS encrypted (HIPAA #1)';
```

2. Criar script de migração de dados: ler cada row com `worker_email IS NOT NULL`, encriptar via KMS e escrever em `worker_email_encrypted`. Usar batch de 100 rows para não lokar a tabela.

3. Validar que 100% das rows com `worker_email` não-NULL têm `worker_email_encrypted` preenchido:

```sql
SELECT COUNT(*) FROM encuadres
WHERE worker_email IS NOT NULL
  AND worker_email_encrypted IS NULL;
-- Deve retornar 0
```

4. Criar segunda migration que dropa a coluna plaintext:

```sql
ALTER TABLE encuadres DROP COLUMN worker_email;
```

5. Atualizar todos os SELECTs, INSERTs e UPDATEs no código para usar `worker_email_encrypted`.

6. Atualizar o serviço de descriptografia para incluir `encuadres.worker_email_encrypted` nas listas de campos auditáveis.

7. Registrar a mudança no `DECISIONS.md` do projeto.

### Critérios de aceite

- [ ] A coluna `worker_email` não existe mais em `encuadres` (verificar com `\d encuadres` no psql).
- [ ] A coluna `worker_email_encrypted` existe, é TEXT, nullable e tem comentário KMS.
- [ ] Nenhuma string de email em plaintext existe na tabela (o ciphertext não deve conter `@`).
- [ ] O serviço de descriptografia consegue decriptar `worker_email_encrypted` corretamente.
- [ ] Nenhuma referência a `encuadres.worker_email` existe no código (`grep -r "worker_email[^_]"` retorna 0 resultados).

### Testes unitários — validar implementação

- `test("Encriptação: worker_email deve ser salvo como ciphertext")` — criar encuadre com email, verificar que o valor salvo não contém `@`.
- `test("Descriptografia: decriptar worker_email_encrypted retorna o email original")` — round-trip de encrypt/decrypt.
- `test("Campo plaintext não existe")` — query em `information_schema.columns` confirma ausência de `worker_email` sem sufixo.
- `test("Dados legados migrados")` — COUNT de encuadres onde `worker_email_encrypted IS NULL` deve ser 0 após migration.

### Testes de regressão — garantir que não volta

- `test("Linter de campos PII")` — script que varre todas as tabelas procurando colunas com nome contendo `email`, `phone`, `cpf`, `document` sem sufixo `_encrypted`. Rodar em CI.
- `test("Nenhum log de email")` — verificar que os logs de Cloud Run não contêm strings de email em plaintext (teste de auditoria).
- `test("Migration não cria campos PII plaintext")` — todo arquivo de migration novo deve ser revisado por regex que detecte `ADD COLUMN.*email.*varchar` sem `_encrypted` no nome.

---

## C2-B — ~~🔴 CRÍTICO (LGPD)~~ COMPLETO: `patient_professionals.email` e `phone` em plaintext

> **Resolvido em:** Migration 071 (`071_wave3_pii_encryption.sql`). Colunas plaintext dropadas, `phone_encrypted` e `email_encrypted` criadas. KMS integrado no `PatientRepository.ts`.
> **Testes:** `tests/e2e/wave3-pii-encryption.test.ts`

### Problema

A tabela `patient_professionals` (migration 038) armazena `email TEXT` e `phone TEXT` dos profissionais tratantes em plaintext. Se o critério que classificou C2 como crítico é LGPD/HIPAA, o mesmo se aplica aqui: dados de contato de profissionais de saúde que acompanham pacientes ativos são PII sensível, sujeita à mesma política de criptografia aplicada ao restante do sistema. A tabela não tem nenhum campo `_encrypted` e não foi incluída na varredura da migration 023.

### Passo a passo de implementação

1. Adicionar as colunas encriptadas:

```sql
ALTER TABLE patient_professionals
  ADD COLUMN phone_encrypted TEXT NULL,
  ADD COLUMN email_encrypted TEXT NULL;

COMMENT ON COLUMN patient_professionals.phone_encrypted
  IS 'Telefone do profissional tratante — KMS encrypted (LGPD)';
COMMENT ON COLUMN patient_professionals.email_encrypted
  IS 'Email do profissional tratante — KMS encrypted (LGPD)';
```

2. Criar script de migração de dados: ler cada row com `phone IS NOT NULL` ou `email IS NOT NULL`, encriptar via KMS e escrever nas colunas criptografadas. Usar batch de 100 rows.

3. Validar cobertura:

```sql
SELECT COUNT(*) FROM patient_professionals
WHERE phone IS NOT NULL AND phone_encrypted IS NULL;
-- Deve retornar 0

SELECT COUNT(*) FROM patient_professionals
WHERE email IS NOT NULL AND email_encrypted IS NULL;
-- Deve retornar 0
```

4. Dropar as colunas plaintext:

```sql
ALTER TABLE patient_professionals
  DROP COLUMN phone,
  DROP COLUMN email;
```

5. Atualizar o código para usar `phone_encrypted` e `email_encrypted`.

6. Incluir `patient_professionals.phone_encrypted` e `patient_professionals.email_encrypted` na lista de campos auditáveis do serviço de descriptografia.

### Critérios de aceite

- [ ] As colunas `phone` e `email` não existem mais em `patient_professionals`.
- [ ] As colunas `phone_encrypted` e `email_encrypted` existem, são TEXT nullable e têm comentário KMS.
- [ ] Nenhum valor plaintext em `phone_encrypted` ou `email_encrypted` (ciphertext não contém `@` nem `+`).
- [ ] O serviço de descriptografia consegue decriptar ambos os campos.
- [ ] O linter de PII do C2 já cobre esta tabela automaticamente após a migration.

### Testes unitários — validar implementação

- `test("Salvar profissional encripta phone e email")` — criar patient_professional com dados de contato, verificar que o banco não contém plaintext.
- `test("Descriptografar retorna dados originais")` — round-trip encrypt/decrypt para ambos os campos.
- `test("Campos plaintext não existem")` — query em `information_schema.columns` confirma ausência de `phone` e `email` sem sufixo.

### Testes de regressão — garantir que não volta

- `test("Linter de PII")` — o mesmo linter do C2 (que varre por `email`, `phone` sem `_encrypted`) deve cobrir `patient_professionals` automaticamente.
- `test("Nenhum profissional com dados plaintext")` — query de integridade semanal.

---

## C2-D — ~~🔴 CRÍTICO (LGPD)~~ COMPLETO: `workers.whatsapp_phone` é plaintext — escapou da migration 023

> **Resolvido em:** Migration 071 (`071_wave3_pii_encryption.sql`). Decisão: encriptar separado (não merge com `phone`). Coluna `whatsapp_phone` dropada, `whatsapp_phone_encrypted` criada. KMS integrado no `WorkerRepository.ts`, `MessagingController.ts` e `OutboxProcessor.ts`.
> **Testes:** `tests/e2e/wave3-pii-encryption.test.ts`

### Problema

A migration 023 consolidou a criptografia de PII em workers, mantendo `phone` e `email` em plaintext por necessidade de deduplicação. Porém, `whatsapp_phone VARCHAR(30)` (adicionada na migration 007) **não foi incluída** na varredura — nem para criptografar, nem para dropar. O campo continua plaintext.

`whatsapp_phone` é um número de telefone pessoal — PII clássica sob LGPD/HIPAA. A migration 023 explicitamente documenta quais campos foram mantidos em plaintext (`email`, `phone`, `document_type`, `cuit`) e `whatsapp_phone` não está nessa lista. Foi simplesmente esquecido.

Adicionalmente, `whatsapp_phone` pode ser redundante com `phone` — na prática, ATs na Argentina frequentemente usam o mesmo número para ambos.

### Passo a passo de implementação

1. Auditar a redundância com `phone`:

```sql
SELECT
  COUNT(*) AS total_com_whatsapp,
  COUNT(*) FILTER (WHERE phone = whatsapp_phone) AS identicos,
  COUNT(*) FILTER (WHERE phone != whatsapp_phone) AS diferentes
FROM workers
WHERE whatsapp_phone IS NOT NULL;
```

2. **Se a maioria for idêntica** (>90%): dropar `whatsapp_phone` e usar `phone` como campo canônico para WhatsApp.

```sql
-- Verificar que nenhum whatsapp_phone difere de phone sem backup
UPDATE workers SET phone = whatsapp_phone
WHERE phone IS NULL AND whatsapp_phone IS NOT NULL;

ALTER TABLE workers DROP COLUMN whatsapp_phone;
```

3. **Se houver diferença significativa**: criptografar o campo.

```sql
ALTER TABLE workers
  ADD COLUMN whatsapp_phone_encrypted TEXT NULL;

COMMENT ON COLUMN workers.whatsapp_phone_encrypted
  IS 'Número de WhatsApp do worker — KMS encrypted (LGPD). Adicionado pela 007, não incluído na 023.';
```

   Migrar dados existentes via KMS, validar cobertura, dropar plaintext.

4. Atualizar o código para usar o campo correto (conforme decisão do passo 2 ou 3).

5. Documentar no `DECISIONS.md`: `whatsapp_phone` foi esquecido na migration 023. Decisão tomada (merge ou encrypt).

### Critérios de aceite

- [ ] `whatsapp_phone` não existe mais em plaintext em `workers`.
- [ ] `DECISIONS.md` documenta a decisão (merge com `phone` ou encrypt separado) com racional.
- [ ] O linter de PII cobre campos com `phone` ou `whatsapp` no nome.

### Testes unitários — validar implementação

- `test("whatsapp_phone plaintext não existe")` — `information_schema.columns` confirma ausência.
- Se merge: `test("phone é usado para envio de WhatsApp")` — verificar que o serviço de mensagens usa `phone`.
- Se encrypt: `test("Descriptografar retorna número original")` — round-trip.

### Testes de regressão — garantir que não volta

- `test("Linter de PII cobre whatsapp")` — o linter deve detectar qualquer coluna com `whatsapp` sem `_encrypted`.

---

## C3 — ~~🔴 CRÍTICO (Entidade faltando)~~ COMPLETO: `coordinator_name` varchar em 4 tabelas sem FK

> **Resolvido em:** Migration 072 + codigo atualizado. Helper `resolveCoordinatorId()` (findOrCreate) criado em `OperationalRepositories.ts:15-28`. Os 3 repos populam `coordinator_id` via lookup. `RecruitmentController` faz JOIN com `coordinators`. `findByCoordinatorAndDate()` usa subquery com `coordinator_id`.
> **Testes:** `tests/e2e/wave4-entities-and-fks.test.ts`

### Problema

O nome do coordenador aparece como texto livre em `job_postings`, `encuadres`, `coordinator_weekly_schedules` e `worker_placement_audits`. Qualquer typo cria dados inconsistentes que quebram relatórios de matchmaking e agendamento. A tabela `coordinator_weekly_schedules` já tem UNIQUE em `(coordinator_name, from_date, to_date)`, evidenciando que coordenadores deveriam ser uma entidade própria.

### Passo a passo de implementação

1. Criar tabela `coordinators`:

```sql
CREATE TABLE public.coordinators (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  dni        VARCHAR(20)  NULL,
  email      VARCHAR(255) NULL,
  is_active  BOOL DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT coordinators_name_key UNIQUE (name)
);
```

2. Popular com todos os nomes distintos atuais:

```sql
INSERT INTO coordinators (name)
SELECT DISTINCT coordinator_name FROM job_postings
  WHERE coordinator_name IS NOT NULL
UNION
SELECT DISTINCT coordinator_name FROM encuadres
  WHERE coordinator_name IS NOT NULL
UNION
SELECT DISTINCT coordinator_name FROM coordinator_weekly_schedules
UNION
SELECT DISTINCT coordinator_name FROM worker_placement_audits
  WHERE coordinator_name IS NOT NULL
ON CONFLICT (name) DO NOTHING;
```

3. Adicionar `coordinator_id` em cada tabela:

```sql
ALTER TABLE job_postings
  ADD COLUMN coordinator_id UUID REFERENCES coordinators(id);
ALTER TABLE encuadres
  ADD COLUMN coordinator_id UUID REFERENCES coordinators(id);
ALTER TABLE coordinator_weekly_schedules
  ADD COLUMN coordinator_id UUID REFERENCES coordinators(id) NOT NULL;
ALTER TABLE worker_placement_audits
  ADD COLUMN coordinator_id UUID REFERENCES coordinators(id);
```

4. Migrar os dados:

```sql
UPDATE job_postings jp
SET coordinator_id = (SELECT id FROM coordinators c WHERE c.name = jp.coordinator_name);

UPDATE encuadres e
SET coordinator_id = (SELECT id FROM coordinators c WHERE c.name = e.coordinator_name);

UPDATE coordinator_weekly_schedules cws
SET coordinator_id = (SELECT id FROM coordinators c WHERE c.name = cws.coordinator_name);

UPDATE worker_placement_audits wpa
SET coordinator_id = (SELECT id FROM coordinators c WHERE c.name = wpa.coordinator_name);
```

5. Validar que a migração foi 100% bem-sucedida:

```sql
SELECT COUNT(*) FROM job_postings
  WHERE coordinator_name IS NOT NULL AND coordinator_id IS NULL;
SELECT COUNT(*) FROM encuadres
  WHERE coordinator_name IS NOT NULL AND coordinator_id IS NULL;
-- Todos devem retornar 0
```

6. Migrar a constraint UNIQUE de `coordinator_weekly_schedules` para usar `coordinator_id`:

```sql
-- Dropar constraint baseada em texto livre
ALTER TABLE coordinator_weekly_schedules
  DROP CONSTRAINT IF EXISTS coordinator_weekly_schedules_coordinator_name_from_date_to_dat_key;

-- Criar constraint com FK tipada
ALTER TABLE coordinator_weekly_schedules
  ADD CONSTRAINT unique_coordinator_schedule
  UNIQUE (coordinator_id, from_date, to_date);
```

7. Marcar colunas `coordinator_name` como DEPRECATED:

```sql
COMMENT ON COLUMN job_postings.coordinator_name
  IS 'DEPRECATED: usar coordinator_id com FK para coordinators';
COMMENT ON COLUMN encuadres.coordinator_name
  IS 'DEPRECATED: usar coordinator_id com FK para coordinators';
COMMENT ON COLUMN coordinator_weekly_schedules.coordinator_name
  IS 'DEPRECATED: usar coordinator_id com FK para coordinators';
COMMENT ON COLUMN worker_placement_audits.coordinator_name
  IS 'DEPRECATED: usar coordinator_id com FK para coordinators';
```

8. Atualizar o código para usar `coordinator_id` em novas escritas e JOIN para leitura.

### Critérios de aceite

- [ ] Tabela `coordinators` existe com pelo menos 1 registro.
- [ ] Todas as 4 tabelas têm coluna `coordinator_id` com FK para `coordinators(id)`.
- [ ] COUNT de rows com `coordinator_name IS NOT NULL AND coordinator_id IS NULL` é 0 em todas as tabelas.
- [ ] INSERT com `coordinator_id` de UUID inexistente retorna `ForeignKeyViolation`.
- [ ] A constraint UNIQUE de `coordinator_weekly_schedules` usa `(coordinator_id, from_date, to_date)`, não mais `coordinator_name`.

### Testes unitários — validar implementação

- `test("Unicidade de nome")` — INSERT de dois coordinators com mesmo `name` deve falhar na segunda inserção.
- `test("FK em job_postings")` — criar `job_posting` com `coordinator_id` válido e inválido, validar comportamentos.
- `test("Dados migrados íntegros")` — para cada tabela, contar rows onde `coordinator_name IS NOT NULL` e `coordinator_id IS NULL`. Deve ser 0.
- `test("JOIN coordinator retorna nome")` — buscar `job_posting` com JOIN em `coordinators` e verificar que o nome bate com o que estava em `coordinator_name`.
- `test("UNIQUE coordinator_schedule usa coordinator_id")` — tentar inserir dois registros para o mesmo coordinator_id + período, verificar conflito.

### Testes de regressão — garantir que não volta

- `test("Nenhuma escrita de coordinator_name sem coordinator_id")` — lint no código que detecta INSERT/UPDATE com `coordinator_name` sem correspondente `coordinator_id`.
- `test("Nomes de coordinator consistentes")` — query semanal que detecta nomes em `coordinator_name` que não existem em `coordinators.name`. Deve retornar 0 rows.
- `test("coordinator_id NOT NULL em novas rows")` — após deprecar `coordinator_name`, qualquer nova migration não pode adicionar `coordinator_name` em novas tabelas.

---

## 🟡 Seção 2 — Normalização e Redundância

Causam duplicidade de dados, múltiplas fontes de verdade e dificuldade de manutenção.

> **Status da seção:** 7/8 completos (N1, N2, N3, N4, N5, N6, N7, N8). N8-C parcial (WorkerDeduplicationService).
> **Migrations:** 070, 071, 076, 077, 078, 080, 081, 082, 083, 089, 090.

---

## N1 — ~~🟡 NORMALIZAÇÃO~~ COMPLETO: `workers.profession` vs `workers.occupation` — enums alinhados no banco e no TypeScript

> **Resolvido em:** Migration 076 (`076_wave5_align_occupation_to_profession.sql`). CHECK constraints alinhados, view `workers_profession_divergence` criada, COMMENTs adicionados.
> **Codigo:** `OperationalEntities.ts:10` atualizado para `'AT' | 'CAREGIVER' | 'NURSE' | 'KINESIOLOGIST' | 'PSYCHOLOGIST'`. `JobPostingEnrichmentService.ts` usa valores corretos no LLM prompt. `import-planilhas.ts` normaliza CUIDADOR→CAREGIVER na importação.
> **Testes:** `tests/e2e/wave5-enum-normalization.test.ts`

### Problema

> **Atenção: a descrição anterior deste item estava desatualizada. O estado atual é pior do que documentado.**

Os dois campos eram idênticos na migration 014 (`AT | CUIDADOR | AMBOS`). Porém, a **migration 064** atualizou `profession` para valores em inglês com novas especialidades:

```
profession: 'AT' | 'CAREGIVER' | 'NURSE' | 'KINESIOLOGIST' | 'PSYCHOLOGIST'
```

Enquanto `occupation` **nunca foi atualizado** e ainda usa os valores originais em espanhol:

```
occupation: 'AT' | 'CUIDADOR' | 'AMBOS'
```

Resultado: os dois campos representam dimensões diferentes com vocabulários incompatíveis. Um worker com `profession = 'CAREGIVER'` e `occupation = 'CUIDADOR'` é a mesma pessoa, mas qualquer query que compare os dois campos diretamente retorna divergência. O algoritmo de matching pode usar o campo errado e filtrar incorretamente.

### Passo a passo de implementação

1. Criar migration para alinhar `occupation` ao novo vocabulário de `profession`:

```sql
-- Migrar valores antigos para o novo enum
UPDATE workers SET occupation = 'CAREGIVER' WHERE occupation = 'CUIDADOR';
UPDATE workers SET occupation = NULL         WHERE occupation = 'AMBOS';
-- AMBOS → NULL pois não há equivalente no novo enum. Documentar no DECISIONS.md.

-- Dropar constraint antiga
ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_occupation_check;

-- Adicionar constraint alinhada com profession
ALTER TABLE workers
  ADD CONSTRAINT workers_occupation_check
  CHECK (occupation IS NULL OR occupation IN (
    'AT', 'CAREGIVER', 'NURSE', 'KINESIOLOGIST', 'PSYCHOLOGIST'
  ));
```

2. Documentar a diferença semântica em `DECISIONS.md`:
   - `profession` = preenchido pelo worker durante o registro no app Enlite (source of truth para o app).
   - `occupation` = preenchido durante sincronização com Ana Care (pode divergir de `profession`).
   - Racional para `AMBOS → NULL`: o campo `occupation` representa a profissão primária do sync externo; sem equivalente no novo enum, o valor fica nulo até novo sync.

3. Adicionar comentários de coluna:

```sql
COMMENT ON COLUMN workers.profession IS
  'Profissão autodeclarada pelo worker no app Enlite. Source of truth. '
  'Valores: AT, CAREGIVER, NURSE, KINESIOLOGIST, PSYCHOLOGIST';

COMMENT ON COLUMN workers.occupation IS
  'Profissão registrada via sync Ana Care. Pode divergir de profession. '
  'Mesmo enum de profession após migration de alinhamento.';
```

4. Criar view de monitoramento de divergências:

```sql
CREATE VIEW workers_profession_divergence AS
SELECT id, profession, occupation
FROM workers
WHERE profession IS NOT NULL
  AND occupation IS NOT NULL
  AND profession <> occupation;
```

5. Definir no código qual campo o algoritmo de matching usa canonicamente (recomendação: `profession`) e documentar.

6. Adicionar alerta operacional: se COUNT da view > threshold, notificar o time via n8n.

### Critérios de aceite

- [ ] `DECISIONS.md` contém entrada explicando `profession` vs `occupation` com data, autor e racional (incluindo tratamento de `AMBOS`).
- [ ] Ambos os campos têm o **mesmo** CHECK constraint após a migration de alinhamento.
- [ ] Ambos os campos têm `COMMENT` no banco.
- [ ] Nenhum worker tem `occupation IN ('CUIDADOR', 'AMBOS')` após a migration.
- [ ] View `workers_profession_divergence` existe e retorna resultados válidos.
- [ ] O algoritmo de matching referencia apenas `profession` canonicamente.
- [ ] Existe alerta configurado para divergência acima do threshold.

### Testes unitários — validar implementação

- `test("View divergência funciona")` — criar worker com `profession=AT` e `occupation=CAREGIVER`, verificar que aparece na view.
- `test("Matching usa campo canônico")` — mock de worker com `profession=AT` e `occupation=CAREGIVER`, verificar que o score usa `profession`.
- `test("Ambos campos validados pelo CHECK")` — tentar inserir valor inválido (`CUIDADOR`) em cada campo e esperar `CheckViolation`.
- `test("Valor CUIDADOR não existe mais")` — verificar que não há workers com `occupation = 'CUIDADOR'` após a migration.

### Testes de regressão — garantir que não volta

- `test("Nenhum código usa occupation para matching")` — grep no código que detecta `occupation` sendo passado para funções de matching. Deve retornar 0.
- `test("Monitor de divergência")` — rodar a query da view semanalmente e registrar resultado em tabela de auditoria.
- `test("Ambos enums idênticos")` — query que compara os CHECK constraints de `profession` e `occupation` em `pg_constraint`. Deve retornar que são idênticos.

---

## N2 — ~~🟡 NORMALIZAÇÃO~~ COMPLETO: `workers.linkedin_url` duplicado — plaintext e encrypted

> **Resolvido em:** Migration 071 (`071_wave3_pii_encryption.sql`). Coluna `linkedin_url` plaintext dropada. Nenhuma referência plaintext restante no código.
> **Testes:** `tests/e2e/wave3-pii-encryption.test.ts`

### Problema

`linkedin_url` existe em plaintext e `linkedin_url_encrypted` como KMS encrypted. Diferente de `phone` e `email` (onde o plaintext serve para deduplicação), uma URL de LinkedIn não tem uso operacional que justifique manter as duas versões. O campo plaintext é um vetor de vazamento desnecessário.

### Passo a passo de implementação

1. Verificar se `linkedin_url` plaintext está em uso no código:

```bash
grep -r "linkedin_url[^_]" ./src --include="*.ts"
```

2. Confirmar que `linkedin_url_encrypted` está populado onde `linkedin_url` tem valor:

```sql
SELECT COUNT(*) FROM workers
WHERE linkedin_url IS NOT NULL
  AND linkedin_url_encrypted IS NULL;
-- Deve retornar 0 antes de prosseguir
```

3. Se houver rows sem encrypted: migrar com o serviço KMS antes de prosseguir.

4. Criar migration:

```sql
DROP INDEX IF EXISTS idx_workers_linkedin;
ALTER TABLE workers DROP COLUMN linkedin_url;
```

5. Atualizar o código para usar `linkedin_url_encrypted` em todas as leituras e escritas.

6. Adicionar comentário em `linkedin_url_encrypted` documentando a mudança.

### Critérios de aceite

- [ ] A coluna `linkedin_url` não existe mais em `workers`.
- [ ] O índice `idx_workers_linkedin` não existe mais.
- [ ] Nenhuma referência a `workers.linkedin_url` (sem sufixo) existe no código.
- [ ] `linkedin_url_encrypted` está populado para todos os registros que tinham `linkedin_url`.

### Testes unitários — validar implementação

- `test("Salvar URL LinkedIn encripta")` — criar worker com URL de LinkedIn, verificar que o valor no banco não contém `linkedin.com`.
- `test("Coluna plaintext não existe")` — query em `information_schema.columns` confirma ausência de `linkedin_url` sem sufixo.
- `test("Descriptografar retorna URL original")` — round-trip encrypt/decrypt com URL real.

### Testes de regressão — garantir que não volta

- `test("Linter de PII sem _encrypted")` — script que detecta colunas com nome contendo `url`, `link`, `profile` quando o campo é PII sem sufixo `_encrypted`. Rodar em CI.
- `test("Snapshot de colunas workers")` — snapshot do conjunto de colunas de `workers`. Qualquer coluna nova ou removida gera alerta para revisão manual.

---

## N3 — ~~🟡 NORMALIZAÇÃO~~ COMPLETO: `patients` tem campos de localização inline + `patient_addresses`

> **Resolvido em:** Migration 083 (`083_wave6_n3_migrate_patient_location_to_addresses.sql`). Dados migrados para `patient_addresses`. Colunas `city_locality`, `province`, `zone_neighborhood` marcadas DEPRECATED com COMMENT.

### Problema

A tabela `patients` ainda contém `city_locality`, `province` e `zone_neighborhood` como colunas inline. A tabela `patient_addresses` foi criada (migration 038) exatamente para normalizar endereços, e já migrou os campos `address_primary`, `address_secondary` e `address_tertiary`. Os três campos restantes representam uma segunda fonte de verdade para localização do paciente, com risco de inconsistência.

> **Nota:** A migration 038 já removeu `address_primary`, `address_primary_raw`, `address_secondary`, `address_secondary_raw` e `address_tertiary_raw` de `patients`. Esta migration deve tratar **apenas** os 3 campos restantes — não referenciar as colunas já removidas.

### Passo a passo de implementação

1. Identificar rows com dados inline mas sem entrada de localização em `patient_addresses`:

```sql
SELECT p.id FROM patients p
WHERE (p.city_locality IS NOT NULL
   OR p.province IS NOT NULL
   OR p.zone_neighborhood IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM patient_addresses pa
    WHERE pa.patient_id = p.id AND pa.address_type = 'primary'
  );
```

2. Migrar os dados inline para `patient_addresses` — apenas para pacientes que ainda não têm entrada `primary` (evita duplicatas, pois `patient_addresses` não tem UNIQUE constraint):

```sql
INSERT INTO patient_addresses (patient_id, address_type, address_raw, source)
SELECT
  id,
  'primary',
  CONCAT_WS(', ', zone_neighborhood, city_locality, province),
  'migration_from_inline'
FROM patients
WHERE (city_locality IS NOT NULL OR province IS NOT NULL OR zone_neighborhood IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM patient_addresses pa
    WHERE pa.patient_id = patients.id AND pa.address_type = 'primary'
  );
```

3. Validar que a migração foi completa:

```sql
SELECT COUNT(*) FROM patients p
WHERE (p.city_locality IS NOT NULL OR p.province IS NOT NULL OR p.zone_neighborhood IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM patient_addresses pa WHERE pa.patient_id = p.id);
-- Deve retornar 0
```

4. Marcar as colunas inline como DEPRECATED:

```sql
COMMENT ON COLUMN patients.city_locality
  IS 'DEPRECATED: usar patient_addresses com address_type=primary';
COMMENT ON COLUMN patients.province
  IS 'DEPRECATED: usar patient_addresses com address_type=primary';
COMMENT ON COLUMN patients.zone_neighborhood
  IS 'DEPRECATED: usar patient_addresses com address_type=primary';
```

5. Atualizar o código para ler endereço exclusivamente de `patient_addresses`.

6. Em migration futura (após período de transição): dropar as colunas inline.

### Critérios de aceite

- [ ] COUNT de `patients` com campos inline não-NULL mas sem entrada em `patient_addresses` é 0.
- [ ] As colunas inline têm comentário DEPRECATED.
- [ ] Nenhuma query nova no código lê `city_locality`, `province` ou `zone_neighborhood` diretamente de `patients`.
- [ ] A query de endereço principal de paciente usa `patient_addresses`.

### Testes unitários — validar implementação

- `test("Endereço principal em patient_addresses")` — criar paciente com endereço, verificar que `patient_addresses` tem 1 row com `address_type=primary`.
- `test("Dados migrados corretamente")` — para cada paciente com dados inline, verificar que `address_raw` em `patient_addresses` contém as partes do endereço.
- `test("Sem leitura dos campos inline")` — mock de patient sem `city_locality` e com `patient_addresses`, verificar que o serviço retorna o endereço correto.
- `test("Idempotência: migration não cria duplicatas")` — rodar a migration duas vezes, verificar que `patient_addresses` não tem entradas duplicadas para o mesmo paciente.

### Testes de regressão — garantir que não volta

- `test("Nenhum novo campo de endereço inline em patients")` — migration linter que detecta `ADD COLUMN` com nome contendo `city`, `province`, `zone`, `neighborhood` diretamente em `patients`.
- `test("Consistência inline vs patient_addresses")` — query semanal que detecta divergência. Deve retornar 0 rows.

---

## N4 — ~~🟡 NORMALIZAÇÃO~~ COMPLETO: `job_postings` com 60+ colunas misturando 4 domínios

> **Resolvido em:** Migrations 080 (Fase 1 — remove `dependency_level`), 081 (Fase 2 — extrai `job_postings_clickup_sync`), 082 (Fase 3 — extrai `job_postings_llm_enrichment`). Queries de OperationalRepositories, JobPostingEnrichmentService e MatchmakingService atualizadas para usar JOINs.

### Problema

A tabela mistura: (1) dados operacionais Enlite, (2) sync do ClickUp (`clickup_*`), (3) enriquecimento LLM (`llm_*`), (4) dados derivados do paciente (`diagnosis`, `patient_zone`, `patient_neighborhood`) que já existem em `patients`. Há também fragmentação de endereço em 3 campos e duplicatas como `status` vs `clickup_status`, `last_comment` vs `last_clickup_comment`.

**Problema adicional — dupla identidade do caso:** `job_postings` tem `case_number INTEGER` (migration 014, chave natural do ClickUp/Planilla Operativa) e `patient_id UUID` (migration 037, FK para `patients`). Os dois identificam o mesmo caso de fontes diferentes. Se o mesmo caso chegar pelo ClickUp e pela Planilla Operativa em momentos diferentes, existe risco de divergência silenciosa entre `case_number` e `clickup_task_id`. A Fase 2 desta tarefa (extração de `job_postings_clickup_sync`) deve resolver isso ao centralizar todos os identificadores ClickUp na tabela de sync.

### Passo a passo de implementação

**Fase 1 — Limpar duplicatas imediatas** (sem criar tabelas novas):

1. Definir `clickup_status` como source of truth para status externo e `status` para status interno.
2. Remover `last_comment` (manter `last_clickup_comment`).
3. Unificar endereço: `service_address_raw` como texto livre, `service_address_formatted` como geocodificado. Remover `service_address` (redundante).
4. Remover campos derivados de paciente: `diagnosis`, `patient_zone`, `patient_neighborhood`, `dependency_level` (ler via JOIN com `patients`). A `dependency_level` foi adicionada na migration 055 como denormalização da Planilla Operativa, mas `patients.dependency_level` já existe desde a migration 037.

**Fase 2 — Extrair sync ClickUp:**

```sql
CREATE TABLE job_postings_clickup_sync (
  job_posting_id       UUID PRIMARY KEY REFERENCES job_postings(id) ON DELETE CASCADE,
  clickup_task_id      TEXT,
  clickup_task_name    TEXT,
  clickup_status       TEXT,
  clickup_priority     TEXT,
  clickup_date_created TIMESTAMPTZ,
  clickup_date_updated TIMESTAMPTZ,
  clickup_date_due     TIMESTAMPTZ,
  last_clickup_comment TEXT,
  comment_count        INT4,
  source_id            TEXT,
  source_created_at    TIMESTAMPTZ,
  source_updated_at    TIMESTAMPTZ,
  synced_at            TIMESTAMPTZ DEFAULT NOW()
);
```

**Fase 3 — Extrair enriquecimento LLM:**

```sql
CREATE TABLE job_postings_llm_enrichment (
  job_posting_id           UUID PRIMARY KEY REFERENCES job_postings(id) ON DELETE CASCADE,
  llm_required_sex         TEXT,
  llm_required_specialties JSONB DEFAULT '[]',
  llm_required_diagnoses   JSONB DEFAULT '[]',
  llm_required_profession  JSONB,
  llm_parsed_schedule      JSONB,
  llm_enriched_at          TIMESTAMPTZ
);
```

5. Migrar dados existentes para as novas tabelas.
6. Remover as colunas migradas de `job_postings`.
7. Atualizar queries, Cloud Functions e n8n para usar JOINs nas novas tabelas.

### Critérios de aceite

- [ ] `job_postings` tem menos de 35 colunas (de 60+).
- [ ] Tabelas `job_postings_clickup_sync` e `job_postings_llm_enrichment` existem com dados migrados.
- [ ] Campos `diagnosis`, `patient_zone` e `patient_neighborhood` não existem mais em `job_postings`.
- [ ] Campo `service_address` removido; apenas `service_address_raw` e `service_address_formatted` existem.
- [ ] Nenhuma query de matching usa colunas deprecated diretamente.

### Testes unitários — validar implementação

- `test("job_postings não tem campos clickup_*")` — `information_schema.columns` deve retornar 0 colunas com prefixo `clickup_` em `job_postings`.
- `test("job_postings não tem campos llm_*")` — idem para prefixo `llm_`.
- `test("JOIN retorna dados de sync ClickUp")` — buscar `job_posting` com JOIN em `clickup_sync` e verificar campos.
- `test("JOIN retorna dados LLM")` — buscar `job_posting` com JOIN em `llm_enrichment` e verificar campos.
- `test("diagnosis lido de patients via JOIN")` — verificar que `diagnosis` vem de `patients`, não de `job_postings`.

### Testes de regressão — garantir que não volta

- `test("Limite de colunas em job_postings")` — query que conta colunas de `job_postings`. Deve ser < 35. Rodar em CI.
- `test("Nenhum campo clickup_* novo em job_postings")` — migration linter que detecta `ADD COLUMN` com prefixo `clickup_` diretamente em `job_postings`.
- `test("Nenhum campo llm_* novo em job_postings")` — idem para prefixo `llm_`.

---

## N5 — ~~🟡 NORMALIZAÇÃO~~ COMPLETO: `workers` tem 4 campos de status: `status`, `overall_status`, `availability_status`, `ana_care_status`

> **Resolvido em:** Migration 077 + codigo atualizado. `MatchmakingService.ts` faz `INNER JOIN worker_eligibility we` com filtro `we.is_matchable = TRUE`. `REFRESH MATERIALIZED VIEW CONCURRENTLY` chamado antes do matching (linha 164). Checks inline de `availability_status` removidos. COMMENTs nos 4 campos. Documentado no DECISIONS.md.
> **Testes:** `tests/e2e/wave5-enum-normalization.test.ts`

### Problema

> **Nota:** O campo `funnel_stage` (migration 014) foi marcado como DEPRECATED na migration 026 e **efetivamente dropado** na migration 028. Não existe mais no banco.

Workers possui 4 campos de status ativos:

| Campo | Introduzido | Semântica |
|---|---|---|
| `status` | migration 001 | Funil de registro no app: `pending → in_progress → approved` |
| `overall_status` | migration 026 + 051 | Status geral de qualificação: `PRE_TALENTUM → QUALIFIED → ACTIVE → BLACKLISTED` |
| `availability_status` | migration 050 | Disponibilidade operacional canônica: `AVAILABLE \| ACTIVE \| ONBOARDING \| INACTIVE` |
| `ana_care_status` | migration 049 | Valor **bruto** do sistema externo Ana Care (ex: `En espera de servicio`, `Activo`, `Baja`) |

`ana_care_status` segue o mesmo padrão problemático de N1 (`occupation` vs `profession`): é o valor bruto externo que alimenta o campo canônico `availability_status` (via mapeamento na migration 050). Mas ambos coexistem sem documentação formal da relação, permitindo que código use `ana_care_status` diretamente em vez do campo canônico.

Sem documentação que defina quando um worker é elegível para matching, cada desenvolvedor implementa sua própria combinação dos campos.

### Passo a passo de implementação

1. Documentar as 4 dimensões em `DECISIONS.md`:
   - `status` = funil de registro (app Enlite).
   - `overall_status` = status geral de qualificação (Talentum + admin).
   - `availability_status` = disponibilidade operacional canônica (fonte: Ana Care sync + admin + app).
   - `ana_care_status` = valor bruto do Ana Care — **nunca** usar diretamente em lógica de matching.

2. Adicionar comentários de coluna:

```sql
COMMENT ON COLUMN workers.ana_care_status IS
  'Valor bruto do campo status no Ana Care. Fonte: sync Ana Care. '
  'NUNCA usar diretamente em lógica de matching — usar availability_status (campo canônico derivado).';
```

3. Criar view materializada `worker_eligibility`:

```sql
CREATE MATERIALIZED VIEW worker_eligibility AS
SELECT
  id,
  status,
  overall_status,
  availability_status,
  (
    status = 'approved'
    AND overall_status IN ('QUALIFIED', 'ACTIVE', 'HIRED', 'MESSAGE_SENT')
    AND (availability_status IS NULL OR availability_status IN ('AVAILABLE', 'ACTIVE'))
    AND deleted_at IS NULL
  ) AS is_matchable,
  (
    status = 'approved'
    AND overall_status NOT IN ('BLACKLISTED', 'INACTIVE')
    AND deleted_at IS NULL
  ) AS is_active
FROM workers;

CREATE UNIQUE INDEX ON worker_eligibility (id);
```

4. Configurar refresh automático da view via trigger ou job agendado no n8n após qualquer UPDATE em `workers`.

5. Atualizar o algoritmo de matching para usar `is_matchable` da view em vez de checar os campos separadamente.

6. Criar função helper no TypeScript:

```typescript
async function isWorkerMatchable(workerId: string): Promise<boolean> {
  const result = await db.query(
    'SELECT is_matchable FROM worker_eligibility WHERE id = $1',
    [workerId]
  );
  return result.rows[0]?.is_matchable ?? false;
}
```

### Critérios de aceite

- [ ] `DECISIONS.md` documenta as 4 dimensões de status, incluindo `ana_care_status` como campo bruto não-canônico.
- [ ] `ana_care_status` tem `COMMENT` no banco indicando que não deve ser usado para matching.
- [ ] View `worker_eligibility` existe com colunas `is_matchable` e `is_active`.
- [ ] O algoritmo de matching usa `is_matchable` como único ponto de entrada de elegibilidade.
- [ ] A view é refreshada automaticamente após UPDATE em `workers`.

### Testes unitários — validar implementação

- `test("is_matchable=true quando todos critérios OK")` — worker com `status=approved`, `overall_status=QUALIFIED`, `availability_status=AVAILABLE`.
- `test("is_matchable=false quando status=pending")`.
- `test("is_matchable=false quando overall_status=BLACKLISTED")`.
- `test("is_matchable=false quando deleted_at IS NOT NULL")` — soft delete deve impedir matching.
- `test("is_matchable=true quando availability_status IS NULL")` — worker sem `availability_status` deve ser incluído com ressalva.

### Testes de regressão — garantir que não volta

- `test("Nenhum código usa ana_care_status para matching")` — grep que detecta `ana_care_status` em queries de matching. Deve retornar 0.
- `test("Matching não usa os campos diretamente")` — grep que detecta uso de `workers.status`, `workers.overall_status` ou `workers.availability_status` em queries de matching sem passar pela view. Deve retornar 0.
- `test("View refreshada após update de status")` — atualizar `overall_status` de um worker e verificar que `worker_eligibility` reflete a mudança em menos de 1s.

---

## N6 — ~~🟡 NORMALIZAÇÃO~~ COMPLETO: `application_status` vs `application_funnel_stage`

> **Resolvido em:** Migration 078 (`078_wave5_funnel_to_status_comments.sql`). Constante `FUNNEL_TO_STATUS` criada em `src/domain/entities/WorkerJobApplication.ts:81-89`. COMMENTs nos dois campos. Documentado no DECISIONS.md.
> **Testes:** `tests/e2e/wave5-enum-normalization.test.ts`

### Problema

Os dois campos rastreiam progresso da candidatura com valores parcialmente sobrepostos. `APPLIED` aparece nos dois; `interview_scheduled` em um e `INTERVIEW_SCHEDULED` no outro. Sem definição clara de qual é canônico, código novo pode escrever no campo errado.

### Passo a passo de implementação

1. Definir e documentar em `DECISIONS.md`:
   - `application_funnel_stage` = campo de negócio, visível na UI, conduzido pelo recrutador.
   - `application_status` = campo técnico sistêmico para integrações e automações.

2. Adicionar comentários de coluna:

```sql
COMMENT ON COLUMN worker_job_applications.application_funnel_stage IS
  'Etapa do funil UI: APPLIED > PRE_SCREENING > INTERVIEW_SCHEDULED > INTERVIEWED > QUALIFIED > REJECTED > HIRED';

COMMENT ON COLUMN worker_job_applications.application_status IS
  'Status técnico sistêmico para integrações: applied, under_review, shortlisted, interview_scheduled, approved, rejected, withdrawn, hired';
```

3. Auditar o código para encontrar todos os pontos que escrevem em ambos os campos.

4. Criar mapeamento explícito no TypeScript:

```typescript
const FUNNEL_TO_STATUS: Record<ApplicationFunnelStage, ApplicationStatus> = {
  APPLIED:             'applied',
  PRE_SCREENING:       'under_review',
  INTERVIEW_SCHEDULED: 'interview_scheduled',
  INTERVIEWED:         'under_review',
  QUALIFIED:           'approved',
  REJECTED:            'rejected',
  HIRED:               'hired',
};
```

5. Decidir e documentar se os dois campos são sincronizados automaticamente (trigger) ou gerenciados independentemente.

### Critérios de aceite

- [ ] `DECISIONS.md` define claramente qual campo é UI-facing e qual é sistêmico.
- [ ] Ambos os campos têm `COMMENT` no banco.
- [ ] O código tem um único ponto de definição do mapeamento entre os dois campos.
- [ ] Nenhum código usa os dois campos de forma intercambiável sem o mapeamento.

### Testes unitários — validar implementação

- `test("Avançar funil atualiza ambos campos consistentemente")` — simular transição de funil e verificar que os dois campos ficam alinhados.
- `test("Mapeamento completo")` — verificar que `FUNNEL_TO_STATUS` tem entrada para cada valor de `ApplicationFunnelStage`.
- `test("Valores do CHECK constraint válidos")` — tentar inserir valor inválido em ambos os campos.

### Testes de regressão — garantir que não volta

- `test("Sem uso misto sem mapeamento")` — lint que detecta funções que manipulam `application_status` e `application_funnel_stage` juntos sem usar `FUNNEL_TO_STATUS`.
- `test("Queries de relatório usam view unificada")` — relatórios de candidaturas devem usar uma view que unifique os dois campos, não os campos diretamente.

---

## N7 — ~~🟡 NORMALIZAÇÃO~~ COMPLETO: `blacklist` permite entradas órfãs duplicadas

> **Resolvido em:** Migration 070 (`070_add_blacklist_orphan_unique_index.sql`). Índice parcial `idx_blacklist_phone_reason_orphan` criado. Duplicatas existentes limpas. `BlacklistRepository.upsert()` atualizado com `ON CONFLICT` correto.

### Problema

O índice único `idx_blacklist_worker_reason` é **parcial**: cobre apenas `WHERE worker_id IS NOT NULL`. Workers importados via Excel que ainda não foram resolvidos com FK ficam com `worker_id IS NULL`, identificados apenas por `worker_raw_phone`. Nesse cenário, re-importar a planilha cria entradas duplicadas para o mesmo telefone + motivo, pois nenhuma constraint cobre esse caso.

Isso significa que um worker bloqueado pode aparecer múltiplas vezes na blacklist sem FK, distorcendo relatórios de vetados e podendo causar falsos positivos em deduplicação.

### Passo a passo de implementação

1. Verificar o volume de duplicatas órfãs existentes:

```sql
SELECT worker_raw_phone, reason, COUNT(*) AS duplicatas
FROM blacklist
WHERE worker_id IS NULL
GROUP BY worker_raw_phone, reason
HAVING COUNT(*) > 1
ORDER BY duplicatas DESC;
```

2. Limpar duplicatas mantendo o registro mais antigo:

```sql
DELETE FROM blacklist
WHERE id NOT IN (
  SELECT DISTINCT ON (worker_raw_phone, reason) id
  FROM blacklist
  WHERE worker_id IS NULL
  ORDER BY worker_raw_phone, reason, created_at ASC
);
```

3. Criar índice único parcial para entradas sem `worker_id`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_blacklist_phone_reason_orphan
  ON blacklist(worker_raw_phone, reason)
  WHERE worker_id IS NULL AND worker_raw_phone IS NOT NULL;
```

4. Atualizar o conversor de importação para usar `ON CONFLICT (worker_raw_phone, reason) WHERE worker_id IS NULL DO NOTHING`.

### Critérios de aceite

- [ ] Query de duplicatas (passo 1) retorna 0 rows após limpeza.
- [ ] Índice `idx_blacklist_phone_reason_orphan` existe no banco.
- [ ] Re-importar a planilha com o mesmo worker bloqueado não cria nova linha.
- [ ] Blacklist com `worker_id` continua usando o índice existente `idx_blacklist_worker_reason`.

### Testes unitários — validar implementação

- `test("Blacklist órfã com mesmo phone+reason: segunda inserção é ignorada")` — inserir dois registros com mesmo `worker_raw_phone` e `reason`, ambos com `worker_id IS NULL`. Verificar que só 1 persiste.
- `test("Blacklist com worker_id: ainda funciona normalmente")` — inserir blacklist com `worker_id` real, verificar que o índice existente continua funcional.

### Testes de regressão — garantir que não volta

- `test("Nenhuma duplicata órfã em blacklist")` — query do passo 1 rodando semanalmente. Deve retornar 0 rows.

---

## N8 — ~~🟡 NORMALIZAÇÃO~~ COMPLETO: Campos `_raw` em `encuadres` e `blacklist` sem política formal de ciclo de vida

> **Resolvido em:** Migration 090 (`090_wave8_n8_raw_field_comments.sql`). COMMENTs adicionados em `encuadres.worker_raw_name`, `encuadres.worker_raw_phone`, `encuadres.occupation_raw`, `blacklist.worker_raw_name`, `blacklist.worker_raw_phone`. Politica documentada no DECISIONS.md.

### Problema

`encuadres` armazena `worker_raw_name`, `worker_raw_phone` e `occupation_raw` ao lado de `worker_id` (FK para workers). `blacklist` armazena `worker_raw_name` e `worker_raw_phone` ao lado de `worker_id`. Esses campos são a representação original da planilha — usados para audit trail e para re-linking quando o worker_id não é resolvido no momento da importação.

O problema não é a existência desses campos (são legítimos), mas a **ausência de política formal**: sem documentação, qualquer dev pode achar que `worker_raw_name` é a fonte de verdade do nome do worker em vez de `workers.first_name_encrypted`. Isso cria risco de:
- Queries que usam `worker_raw_name` para display na UI (exibindo dados desatualizados)
- Reports que contam por `worker_raw_phone` em vez de `worker_id` (duplicando workers já linkados)

### Passo a passo de implementação

1. Documentar a política em `DECISIONS.md`:
   - Campos `_raw` são **somente leitura após importação**. Nunca atualizados.
   - São usados para: (a) audit trail da planilha original, (b) re-linking via `linkWorkersByPhone()`.
   - **Nunca** usar para display na UI ou lógica de negócio. Usar `workers.*_encrypted` via JOIN com `worker_id`.

2. Adicionar comentários de coluna:

```sql
COMMENT ON COLUMN encuadres.worker_raw_name IS
  'Valor bruto da planilha — SOMENTE para audit trail e re-linking. '
  'Para display/lógica, usar JOIN workers via worker_id.';
COMMENT ON COLUMN encuadres.worker_raw_phone IS
  'Valor bruto da planilha — SOMENTE para audit trail e re-linking. '
  'Para display/lógica, usar JOIN workers via worker_id.';
COMMENT ON COLUMN encuadres.occupation_raw IS
  'Valor bruto da planilha — SOMENTE para audit trail. '
  'Para lógica, usar workers.profession via worker_id.';

COMMENT ON COLUMN blacklist.worker_raw_name IS
  'Valor bruto da planilha — SOMENTE para audit trail e re-linking. '
  'Para display/lógica, usar JOIN workers via worker_id.';
COMMENT ON COLUMN blacklist.worker_raw_phone IS
  'Valor bruto da planilha — SOMENTE para audit trail e re-linking. '
  'Para display/lógica, usar JOIN workers via worker_id.';
```

3. Auditar o código para garantir que nenhuma query de UI ou matching usa campos `_raw`:

```bash
grep -r "worker_raw_name\|worker_raw_phone\|occupation_raw" ./src --include="*.ts" \
  | grep -v "test\|spec\|migration\|converter\|linkWorker"
# Deve retornar 0 resultados fora de contextos de importação/linking
```

### Critérios de aceite

- [ ] `DECISIONS.md` contém política formal de campos `_raw` com exemplos de uso correto e proibido.
- [ ] Todos os campos `_raw` em `encuadres` e `blacklist` têm `COMMENT` no banco.
- [ ] Nenhuma query de UI ou matching usa campos `_raw` diretamente.

### Testes de regressão — garantir que não volta

- `test("Nenhum uso de _raw fora de import/linking")` — grep que detecta referências a `worker_raw_name`, `worker_raw_phone`, `occupation_raw` em código de UI, matching ou reports. Deve retornar 0.
- `test("Novos campos _raw devem ter COMMENT")` — migration linter que detecta `ADD COLUMN.*_raw` sem `COMMENT ON COLUMN` correspondente.

---

## N8-C — 🟠 PARCIAL (reclassificado para CRITICO): `blacklist.reason` e `detail` contêm PII clinico confirmado

> **Migration:** 089 (`089_wave8_n8c_blacklist_pii_encryption.sql`) — Fase 1 concluida.
> **BlacklistRepository:** CORRIGIDO — KMS injetado, `upsert()` encripta, `mapRow()` async com decrypt + fallback. Dual-write (plaintext + encrypted) ativo.
> **GAP RESIDUAL:** `WorkerDeduplicationService.ts` (linhas ~414-420) copia entradas de blacklist durante merge de workers usando apenas colunas plaintext, sem copiar `reason_encrypted`/`detail_encrypted`. Ver GAP 4 residual em `roadmap_schema_gaps.md`.
> **Fase 2 (dropar plaintext):** Pendente apos corrigir todos os consumers e migrar dados legados.

### Problema

> **Severidade condicional:** Este item requer amostragem dos dados reais antes de ser classificado como CRÍTICO. Se a amostragem confirmar PII clínico, reclassificar para 🔴. Executar a query do passo 1 em produção.

Os campos `reason TEXT NOT NULL` e `detail TEXT` da tabela `blacklist` podem conter motivações clínicas sensíveis em texto livre (ex: `"abandono de paciente em crise"`, `"comportamento inadequado durante atendimento"`). Se confirmado, esses dados caracterizam informação clínica sobre a relação worker-paciente.

O linter de PII do C2 **não detecta** este caso porque os nomes das colunas não contêm `email`, `phone`, `cpf` ou `document` — é PII semântico, não estrutural. A tabela não passou pela migration 023 de criptografia.

### Passo a passo de implementação

1. **Amostragem obrigatória antes de prosseguir:**

```sql
SELECT reason, detail FROM blacklist
WHERE reason ILIKE '%paciente%'
   OR reason ILIKE '%atendimento%'
   OR reason ILIKE '%familiar%'
   OR detail ILIKE '%paciente%'
LIMIT 20;
```

   - **Se retornar 0 rows:** documentar no `DECISIONS.md` que a tabela foi auditada e classificada como não-PII clínico. Adicionar `COMMENT` nos campos. Encerrar.
   - **Se retornar rows com conteúdo clínico:** reclassificar para 🔴 CRÍTICO e prosseguir com os passos abaixo.

2. Adicionar colunas criptografadas:

```sql
ALTER TABLE blacklist
  ADD COLUMN reason_encrypted TEXT NULL,
  ADD COLUMN detail_encrypted  TEXT NULL;

COMMENT ON COLUMN blacklist.reason_encrypted
  IS 'Motivo do bloqueio — KMS encrypted (LGPD). Pode conter dados clínicos.';
COMMENT ON COLUMN blacklist.detail_encrypted
  IS 'Detalhe do bloqueio — KMS encrypted (LGPD). Pode conter dados clínicos.';
```

3. Migrar dados existentes via script KMS em batch de 100 rows.

4. Validar cobertura:

```sql
SELECT COUNT(*) FROM blacklist
WHERE reason IS NOT NULL AND reason_encrypted IS NULL;
-- Deve retornar 0
```

5. Dropar as colunas plaintext:

```sql
ALTER TABLE blacklist
  DROP COLUMN reason,
  DROP COLUMN detail;
```

6. Atualizar o código para usar `reason_encrypted` e `detail_encrypted`.

7. Expandir o linter de PII para incluir varredura semântica por nomes como `reason`, `detail`, `observation`, `notes` em tabelas classificadas como sensíveis.

### Critérios de aceite

- [ ] A query de amostragem (passo 1) foi executada em produção com resultado documentado.
- [ ] Se PII confirmado: colunas plaintext removidas e criptografadas existem.
- [ ] Se não-PII: entrada em `DECISIONS.md` com classificação, data e responsável.

### Testes de regressão — garantir que não volta

- `test("Linter semântico de PII")` — varredura por colunas `reason`, `detail`, `notes`, `observation` em tabelas sensíveis sem sufixo `_encrypted`. Rodar em CI.

---

## 🔵 Seção 3 — Design e Consistência

Causam inconsistências que se tornam bugs quando o sistema cresce, especialmente ao ativar o Brasil.

> **Status da seção:** 8/11 completos (D1, D2, D3, D3-B, D4, D4-B, D7, D8, D9). D5 parcial por design. D6 parcial (deleted_at filter em ~20 queries).
> **Migrations:** 069, 073, 074, 075, 079, 084, 085, 086, 087.

---

## D1 — ~~🔵 DESIGN~~ COMPLETO: Duas tabelas de localização com padrões diferentes

> **Resolvido em:** Migration 084 (`084_wave7_d1_geography_worker_service_areas.sql`). Coluna `location geography GENERATED ALWAYS` adicionada. Índice GIST criado. `MatchmakingService.ts` atualizado para usar `ST_DWithin`. Documentado no DECISIONS.md.
> **Testes:** `tests/e2e/wave7-operational.test.ts`

### Problema

`worker_locations` (Argentina, Excel) tem coluna `location geography GENERATED ALWAYS` para uso com `ST_DWithin`. `worker_service_areas` (Brasil, registro) tem `lat/lng` mas **não tem** a coluna geography gerada. O matching geográfico vai funcionar de forma diferente para workers AR vs BR, gerando bugs silenciosos.

### Passo a passo de implementação

1. Adicionar a coluna geography gerada em `worker_service_areas`:

```sql
ALTER TABLE worker_service_areas
ADD COLUMN location public.geography(point, 4326)
GENERATED ALWAYS AS (
  CASE
    WHEN latitude IS NOT NULL AND longitude IS NOT NULL
    THEN ST_MakePoint(longitude::float8, latitude::float8)::geography
    ELSE NULL
  END
) STORED;

CREATE INDEX idx_worker_service_areas_location
  ON worker_service_areas USING GIST (location)
  WHERE location IS NOT NULL;
```

2. Verificar que a extensão PostGIS está habilitada no banco BR (quando ativado).

3. Criar função helper unificada no código:

```typescript
async function getWorkerLocation(workerId: string, country: string) {
  if (country === 'AR') {
    return db.query('SELECT location FROM worker_locations WHERE worker_id = $1', [workerId]);
  }
  return db.query('SELECT location FROM worker_service_areas WHERE worker_id = $1', [workerId]);
}
```

4. Atualizar as queries de matching para usar a função helper.

5. Documentar a diferença de propósito entre as duas tabelas em `DECISIONS.md`.

### Critérios de aceite

- [ ] `worker_service_areas` tem coluna `location geography GENERATED ALWAYS`.
- [ ] Índice GIST existe em `worker_service_areas.location`.
- [ ] Uma query `ST_DWithin` funciona da mesma forma em ambas as tabelas.
- [ ] O código de matching usa a função helper e não referencia as tabelas diretamente.

### Testes unitários — validar implementação

- `test("ST_DWithin funciona em worker_service_areas")` — criar registro com lat/lng, verificar que `ST_DWithin(location, ponto_próximo, 5000)` retorna true.
- `test("Coluna location gerada automaticamente")` — inserir lat/lng, verificar que `location` foi populado sem valor explícito.
- `test("Helper retorna ponto correto para AR e BR")` — mock de worker AR e BR, verificar que o helper retorna a geography correta de cada tabela.

### Testes de regressão — garantir que não volta

- `test("Qualquer nova tabela de localização deve ter coluna geography gerada")` — lint que detecta tabelas com colunas `lat` e `lng` sem coluna `location geography` correspondente.
- `test("Matching geográfico usa ST_DWithin, não cálculo manual")` — grep que detecta fórmula Haversine ou cálculo manual de distância. Deve retornar 0.

---

## D2 — ~~🔵 DESIGN~~ COMPLETO: Três mecanismos de rastreamento de mensagens com responsabilidades sobrepostas

> **Resolvido em:** Migration 085 (`085_wave7_d2_messaging_comments_on_delete.sql`). TABLE COMMENTs adicionados. FKs `worker_id` alteradas para `ON DELETE SET NULL`. Documentado no DECISIONS.md.
> **Testes:** `tests/e2e/wave7-operational.test.ts`

### Problema

O sistema tem três lugares que registram envios de mensagens WhatsApp:

1. **`messaging_outbox`** (migration 060) — fila transacional com retry, para mensagens individuais.
2. **`whatsapp_bulk_dispatch_logs`** (migration 062) — log imutável de campanhas em massa.
3. **`worker_job_applications.messaged_at`** (migration 061) — timestamp do último WhatsApp de vaga enviado para um worker.

As tabelas 1 e 2 já compartilham `twilio_sid` e `delivery_status` (migration 065). Não há FK entre elas. O campo `messaged_at` (3) é derivado do estado em `messaging_outbox` mas é gravado independentemente — se um envio falhar e for retentado com sucesso, `messaged_at` já foi gravado na tentativa anterior. Sem definição formal, o código pode verificar a fonte errada para status de entrega.

Adicionalmente: `worker_id` em ambas as tabelas de mensagens não tem `ON DELETE` declarado — o default PostgreSQL (`RESTRICT`) bloqueia silenciosamente a exclusão de qualquer worker que tenha histórico de mensagens.

### Passo a passo de implementação

1. Documentar formalmente em `DECISIONS.md`:
   - `messaging_outbox` = fila transacional com retry (mensagens individuais sobre candidaturas específicas).
   - `whatsapp_bulk_dispatch_logs` = log imutável de campanhas em massa (disparo em lote, sem retry).
   - `messaged_at` = denormalização para performance de UI (mostrar badge "Já notificado"), atualizada apenas após envio **confirmado** bem-sucedido via callback Twilio.

2. Adicionar comentários nas tabelas:

```sql
COMMENT ON TABLE messaging_outbox IS
  'Fila transacional de envios individuais com retry logic. Cada row é uma mensagem para um worker específico.';

COMMENT ON TABLE whatsapp_bulk_dispatch_logs IS
  'Log imutável de campanhas em massa. triggered_by = Firebase UID do admin. Um envio em lote gera N linhas.';
```

3. Definir política de ON DELETE em `worker_id`:

```sql
-- messaging_outbox: SET NULL para não bloquear exclusão de worker
ALTER TABLE messaging_outbox
  DROP CONSTRAINT messaging_outbox_worker_id_fkey;
ALTER TABLE messaging_outbox
  ADD CONSTRAINT messaging_outbox_worker_id_fkey
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE SET NULL;

-- whatsapp_bulk_dispatch_logs: idem
ALTER TABLE whatsapp_bulk_dispatch_logs
  DROP CONSTRAINT whatsapp_bulk_dispatch_logs_worker_id_fkey;
ALTER TABLE whatsapp_bulk_dispatch_logs
  ADD CONSTRAINT whatsapp_bulk_dispatch_logs_worker_id_fkey
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE SET NULL;
```

4. Avaliar e decidir: bulk_dispatch deve criar registro em `messaging_outbox` (para rastreabilidade unificada) ou operar independentemente?

   - **Se criar:** `ALTER TABLE whatsapp_bulk_dispatch_logs ADD COLUMN outbox_id UUID REFERENCES messaging_outbox(id);`
   - **Se independente:** documentar que `twilio_sid` de bulk nunca aparece em `messaging_outbox`.

5. Garantir que `messaged_at` só é atualizado após callback de entrega confirmado (não no momento do envio).

### Critérios de aceite

- [ ] `DECISIONS.md` define claramente quando cada mecanismo é usado.
- [ ] Ambas as tabelas de mensagens têm `TABLE COMMENT` explicando seu propósito.
- [ ] `worker_id` em ambas as tabelas tem `ON DELETE SET NULL` (ou política explícita documentada).
- [ ] `messaged_at` é atualizado apenas após confirmação de entrega bem-sucedida.
- [ ] Nenhum código verifica status de entrega nas duas tabelas para a mesma mensagem.

### Testes unitários — validar implementação

- `test("Envio individual cria registro em messaging_outbox")`.
- `test("Envio bulk cria registros em whatsapp_bulk_dispatch_logs")`.
- `test("messaged_at só atualizado em sucesso")` — simular falha no envio, verificar que `messaged_at` não é atualizado.
- `test("Sem duplicidade de twilio_sid")` — verificar que o mesmo `twilio_sid` não aparece nas duas tabelas sem relação explícita.
- `test("Deletar worker não falha com RESTRICT")` — deletar worker com histórico de mensagens, verificar que a operação não é bloqueada.

### Testes de regressão — garantir que não volta

- `test("Nenhum código consulta as duas tabelas para o mesmo envio")` — lint que detecta queries que leem `twilio_sid` de ambas as tabelas na mesma função.

---

## D3 — ~~🔵 DESIGN~~ COMPLETO: `job_postings.assignee` é text — deveria referenciar `users`

> **Resolvido em:** Migration 073 (`073_wave4_assignee_uid_recruiter_uid.sql`). Coluna `assignee_uid VARCHAR(128)` adicionada com FK para `users(firebase_uid)`. Dados migrados. Campo `assignee` marcado DEPRECATED.
> **Testes:** `tests/e2e/wave4-entities-and-fks.test.ts`

### Problema

O campo `assignee` guarda o responsável pela vaga como texto livre. Se o admin mudar de nome ou email, os registros históricos ficam inconsistentes. Sem FK, não há garantia que o assignee seja um usuário válido.

### Passo a passo de implementação

1. Adicionar coluna com FK:

```sql
ALTER TABLE job_postings
  ADD COLUMN assignee_uid VARCHAR(128)
  REFERENCES users(firebase_uid) ON DELETE SET NULL;

COMMENT ON COLUMN job_postings.assignee_uid IS
  'Firebase UID do admin responsável pela vaga. Substitui o campo assignee (text).';
```

2. Migrar dados existentes: fazer lookup pelo texto em `users.display_name` ou `users.email` e popular `assignee_uid` onde houver match.

3. Para registros sem match (assignee histórico que não é mais usuário): deixar `assignee_uid` NULL e manter `assignee` como referência histórica.

4. Adicionar comentário DEPRECATED em `assignee`:

```sql
COMMENT ON COLUMN job_postings.assignee IS 'DEPRECATED: usar assignee_uid com FK para users';
```

5. Atualizar o código para escrever em `assignee_uid` e fazer JOIN com `users` para leitura.

### Critérios de aceite

- [ ] Coluna `assignee_uid` existe com FK para `users(firebase_uid)`.
- [ ] COUNT de `job_postings` com `assignee` não-NULL e `assignee_uid` NULL está documentado como registros históricos.
- [ ] Novos `job_postings` não são criados com `assignee` sem `assignee_uid`.
- [ ] Nenhum código novo usa `assignee` (texto) para lógica de negócio.

### Testes unitários — validar implementação

- `test("FK assignee_uid válida")` — criar `job_posting` com `firebase_uid` de usuário existente, verificar sucesso.
- `test("FK inválida retorna erro")` — tentar criar com uid inexistente, verificar `ForeignKeyViolation`.
- `test("SET NULL ao deletar user")` — deletar user, verificar que `job_postings.assignee_uid` vira NULL sem deletar o `job_posting`.

### Testes de regressão — garantir que não volta

- `test("Nenhum INSERT novo usa assignee sem assignee_uid")` — lint que detecta criação de `job_posting` com campo `assignee` (texto) sem `assignee_uid`.
- `test("assignee_uid preenchido em novos registros")` — query que conta `job_postings` criados após a migration com `assignee_uid IS NULL`. Deve ser 0.

---

## D3-B — ~~🔵 DESIGN~~ COMPLETO: `publications.recruiter_name` é text sem FK — mesmo padrão do C3

> **Resolvido em:** Migration 073 (`073_wave4_assignee_uid_recruiter_uid.sql`). Coluna `recruiter_uid VARCHAR(128)` adicionada em `publications` e `encuadres` com FK para `users(firebase_uid)`. Dados migrados. Campo `recruiter_name` marcado DEPRECATED.
> **Testes:** `tests/e2e/wave4-entities-and-fks.test.ts`

### Problema

A tabela `publications` (migration 014) armazena `recruiter_name VARCHAR(100)` como texto livre, pelo mesmo padrão identificado no C3 para `coordinator_name`. Um recrutador com nome digitado diferente em `publications` e `encuadres` cria relatórios inconsistentes sobre quem publicou e quem entrevistou para cada caso. `publications.recruiter_name` não foi incluído no C3 pois a tabela não aparece entre as quatro identificadas originalmente.

Após a execução do C3 (criação da tabela `coordinators`), avaliar se existe uma tabela `recruiters` análoga ou se `users` serve como referência para recrutadores.

### Passo a passo de implementação

1. Definir a entidade referenciada: os recrutadores são usuários do sistema (`users`) ou uma entidade separada?

   - **Se são usuários:** adicionar `recruiter_uid VARCHAR(128) REFERENCES users(firebase_uid) ON DELETE SET NULL`
   - **Se são entidade separada:** criar tabela `recruiters` análoga à `coordinators`

2. Popular a nova coluna com dados existentes (lookup por nome em `users.display_name` ou nova tabela).

3. Validar cobertura:

```sql
SELECT COUNT(*) FROM publications
WHERE recruiter_name IS NOT NULL AND recruiter_uid IS NULL;
-- Registros sem match ficam com recruiter_uid NULL (histórico)
```

4. Marcar `recruiter_name` como DEPRECATED e atualizar o código.

### Critérios de aceite

- [ ] `publications` tem coluna `recruiter_uid` (ou `recruiter_id`) com FK tipada.
- [ ] `DECISIONS.md` documenta se recrutadores são `users` ou entidade própria.
- [ ] COUNT de rows com `recruiter_name IS NOT NULL AND recruiter_uid IS NULL` está documentado como histórico.

### Testes unitários — validar implementação

- `test("FK recruiter_uid válida")` — criar publication com uid de recrutador válido, verificar sucesso.
- `test("FK inválida retorna erro")` — tentar criar com uid inexistente.

### Testes de regressão — garantir que não volta

- `test("Nenhuma nova coluna _name sem FK")` — linter que detecta `ADD COLUMN` com sufixo `_name` sem `_id` ou `_uid` correspondente em tabelas relacionais.

---

## D4 — ~~🔵 DESIGN~~ COMPLETO: `patients.country` é `text` sem constraint

> **Resolvido em:** Migration 069 (`069_add_country_constraints.sql`). Coluna convertida para `bpchar(2)` NOT NULL com CHECK constraint `valid_patient_country` (AR|BR). Dados normalizados.
> **Testes:** `tests/e2e/wave2-schema-migrations.test.ts`

### Problema

Todas as outras tabelas com campo `country` usam `bpchar(2)` com CHECK constraint (`AR | BR`). `patients` usa `text DEFAULT 'AR'` sem constraint. Qualquer string pode ser inserida, o que vai quebrar queries multi-país que dependem de `bpchar(2)` para filtrar.

### Passo a passo de implementação

1. Verificar se há valores inválidos:

```sql
SELECT DISTINCT country, COUNT(*) FROM patients GROUP BY country;
```

2. Corrigir valores inválidos encontrados (`UPDATE` para `'AR'` ou `'BR'` conforme o caso).

3. Criar migration:

```sql
ALTER TABLE patients
  ALTER COLUMN country TYPE bpchar(2) USING country::bpchar(2);

ALTER TABLE patients ALTER COLUMN country SET NOT NULL;

ALTER TABLE patients ADD CONSTRAINT valid_patient_country
  CHECK (country = ANY (ARRAY['AR'::bpchar, 'BR'::bpchar]));
```

4. Verificar que o DEFAULT continua funcionando:

```sql
SELECT column_default FROM information_schema.columns
WHERE table_name = 'patients' AND column_name = 'country';
-- Deve retornar: 'AR'::bpchar
```

### Critérios de aceite

- [ ] `patients.country` é `bpchar(2)` NOT NULL com CHECK constraint (`AR | BR`).
- [ ] Tentativa de inserir `country='US'` retorna `CheckViolation`.
- [ ] Todos os registros existentes têm `country IN ('AR', 'BR')`.
- [ ] DEFAULT `'AR'` ainda funciona após a migration.

### Testes unitários — validar implementação

- `test("Inserir country=AR é válido")`.
- `test("Inserir country=BR é válido")`.
- `test("Inserir country=US retorna CheckViolation")`.
- `test("DEFAULT country=AR")` — criar patient sem especificar `country`, verificar que `country='AR'`.

### Testes de regressão — garantir que não volta

- `test("Tipo de patients.country")` — query em `information_schema.columns` confirma `data_type=character` e `character_maximum_length=2`.
- `test("Nenhuma nova tabela com country sem constraint")` — migration linter que detecta `ADD COLUMN.*country.*text` sem CHECK constraint.

---

## D4-B — ~~🔵 DESIGN~~ COMPLETO: `worker_locations.country` é `text` sem constraint — mesmo padrão do D4

> **Resolvido em:** Migration 069 (`069_add_country_constraints.sql`). Coluna convertida para `bpchar(2)` NOT NULL com CHECK constraint `valid_worker_locations_country` (AR|BR). Dados normalizados.
> **Testes:** `tests/e2e/wave2-schema-migrations.test.ts`

### Problema

A tabela `worker_locations` (migration 034) usa `country TEXT DEFAULT 'AR'` sem CHECK constraint. Exatamente o mesmo bug do D4. Quando o Brasil for ativado, queries multi-país que filtram por `country` vão silenciosamente incluir valores inválidos inseridos por importação de Excel (ex: `'Argentina'`, `'ar'`), sem nenhuma validação de banco que os bloqueie.

### Passo a passo de implementação

1. Verificar valores atuais:

```sql
SELECT DISTINCT country, COUNT(*) FROM worker_locations GROUP BY country;
```

2. Corrigir inválidos e criar migration:

```sql
-- Normalizar valores que podem vir do Excel
UPDATE worker_locations SET country = 'AR'
  WHERE country NOT IN ('AR', 'BR') OR country IS NULL;

ALTER TABLE worker_locations
  ALTER COLUMN country TYPE bpchar(2) USING country::bpchar(2);

ALTER TABLE worker_locations ALTER COLUMN country SET NOT NULL;

ALTER TABLE worker_locations ADD CONSTRAINT valid_worker_locations_country
  CHECK (country = ANY (ARRAY['AR'::bpchar, 'BR'::bpchar]));
```

3. Atualizar os conversores de importação de Excel para normalizar o campo `country` para `bpchar(2)` antes do upsert.

### Critérios de aceite

- [ ] `worker_locations.country` é `bpchar(2)` NOT NULL com CHECK constraint (`AR | BR`).
- [ ] Tentativa de inserir `country='US'` retorna `CheckViolation`.
- [ ] O conversor de importação de Excel normaliza `country` para `bpchar(2)` antes do upsert.

### Testes unitários — validar implementação

- `test("Inserir country=AR é válido")`.
- `test("Inserir country=US retorna CheckViolation")`.
- `test("Conversor Excel normaliza country para bpchar(2)")`.

### Testes de regressão — garantir que não volta

- `test("Nenhuma nova tabela com country sem constraint")` — o mesmo migration linter do D4 cobre esta tabela automaticamente.

---

## D5 — 🔵 PARCIAL (por design): `workers` não tem FK explícita para `users`

> **Status:** Migration 074 (`074_wave4_workers_auth_uid_monitoring.sql`). Decisão deliberada: Opção B — **não adicionar FK** porque workers importados via Excel podem existir sem `users`. View `workers_without_users` criada para monitoramento. Documentado no DECISIONS.md.
> **Testes:** `tests/e2e/wave4-entities-and-fks.test.ts`

### Problema

`workers.auth_uid` é um UNIQUE varchar que deveria corresponder a `users.firebase_uid`, mas sem FK declarada. Workers importados do Excel podem existir sem usuário correspondente, sem que o banco sinalize.

### Passo a passo de implementação

1. Verificar workers sem usuário correspondente:

```sql
SELECT COUNT(*) FROM workers w
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE u.firebase_uid = w.auth_uid
);
```

2. Decidir a política e documentar em `DECISIONS.md`:

   - **Opção A** — Todos os workers têm usuário: corrigir órfãos e adicionar FK:
   ```sql
   ALTER TABLE workers
     ADD CONSTRAINT workers_auth_uid_users_fkey
     FOREIGN KEY (auth_uid) REFERENCES users(firebase_uid) ON DELETE CASCADE;
   ```

   - **Opção B** — Workers podem existir sem usuário (import Excel): não adicionar FK e criar view de monitoramento:
   ```sql
   CREATE VIEW workers_without_users AS
   SELECT w.id, w.auth_uid, w.email, w.created_at
   FROM workers w
   WHERE NOT EXISTS (
     SELECT 1 FROM users u WHERE u.firebase_uid = w.auth_uid
   );
   ```

3. Atualizar o fluxo de importação do Excel para criar usuário antes de criar worker quando aplicável.

### Critérios de aceite

- [ ] A decisão está documentada em `DECISIONS.md` com racional.
- [ ] Se FK adicionada: constraint existe no banco e workers órfãos = 0.
- [ ] Se FK não adicionada: view `workers_without_users` existe e é monitorada.
- [ ] O fluxo de importação respeita a política definida.

### Testes unitários — validar implementação

- `test("Criar worker com auth_uid válido")` — criar user, criar worker com mesmo `auth_uid`, verificar sucesso.
- `test("Fluxo de importação cria user antes do worker")` — simular importação Excel e verificar ordem de criação.
- Se FK existe: `test("Worker sem user é rejeitado")` — tentar criar worker com `auth_uid` inexistente em `users`.

### Testes de regressão — garantir que não volta

- `test("Nenhum worker órfão")` — query semanal que detecta workers cujo `auth_uid` não existe em `users`. Alertar via n8n se COUNT > 0.
- `test("Fluxo de registro sempre cria user antes de worker")` — teste de integração do fluxo de registro completo.

---

## D6 — 🟠 PARCIAL: `encuadres`/`worker_placement_audits` com ON DELETE CASCADE + `job_postings` sem `deleted_at`

> **Migration:** 075 (`075_wave4_on_delete_set_null_and_soft_delete.sql`). FKs alteradas para `ON DELETE SET NULL`. Coluna `deleted_at TIMESTAMPTZ` adicionada com indice parcial.
> **Testes:** `tests/e2e/wave4-entities-and-fks.test.ts`
> **RecruitmentController:** CORRIGIDO (8/9 metodos filtram `deleted_at IS NULL`).
> **GAP RESIDUAL:** ~20 queries em 8 outros arquivos (`VacanciesController`, `MatchmakingService`, `JobPostingEnrichmentService`, `AnalyticsRepository`, `EncuadreRepository`, `ClickUpCaseRepository`, `OperationalRepositories`, `TalentumWebhookController`) não filtram `deleted_at`. Ver GAP 1 em `roadmap_schema_gaps.md`.

### Problema

Dois problemas relacionados:

**Problema A:** `encuadres.job_posting_id` e `worker_placement_audits.job_posting_id` usam `ON DELETE CASCADE`. Se um `job_posting` for deletado, **todos os registros de entrevistas e avaliações pós-alocação são destruídos em cascata**, sem possibilidade de recuperação. Isso conflita com os propósitos dessas tabelas:
- `encuadres` registra histórico clínico de entrevistas de matching — dado auditável por reguladores.
- `worker_placement_audits` é o único feedback estruturado de qualidade pós-alocação e alimenta o score de confiabilidade do worker no matching.

**Problema B:** `job_postings` não tem coluna `deleted_at`. A recomendação de "usar soft delete para arquivamento" (mencionada como solução do Problema A) não tem base no schema atual — qualquer rotina que queira arquivar um caso precisa usar `status = 'closed'`, mas isso não impede o DELETE físico.

### Passo a passo de implementação

1. Alterar a política de deleção em ambas as tabelas:

```sql
-- encuadres
ALTER TABLE encuadres
  DROP CONSTRAINT encuadres_job_posting_id_fkey;
ALTER TABLE encuadres
  ADD CONSTRAINT encuadres_job_posting_id_fkey
  FOREIGN KEY (job_posting_id) REFERENCES job_postings(id) ON DELETE SET NULL;

-- worker_placement_audits
ALTER TABLE worker_placement_audits
  DROP CONSTRAINT worker_placement_audits_job_posting_id_fkey;
ALTER TABLE worker_placement_audits
  ADD CONSTRAINT worker_placement_audits_job_posting_id_fkey
  FOREIGN KEY (job_posting_id) REFERENCES job_postings(id) ON DELETE SET NULL;
```

2. Adicionar `deleted_at` em `job_postings` para habilitar soft delete:

```sql
ALTER TABLE job_postings
  ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN job_postings.deleted_at
  IS 'Soft delete: preenchido em vez de DELETE físico. '
     'Registros com deleted_at IS NOT NULL são ignorados em queries operacionais.';

CREATE INDEX idx_job_postings_deleted_at
  ON job_postings(deleted_at)
  WHERE deleted_at IS NOT NULL;
```

3. Atualizar todas as queries operacionais de `job_postings` para incluir `WHERE deleted_at IS NULL`.

4. Documentar em `DECISIONS.md` que `job_postings` não devem ser deletados fisicamente.

5. Auditar se existe alguma rotina de limpeza (`DELETE FROM job_postings WHERE ...`) que possa estar causando perda silenciosa de dados.

### Critérios de aceite

- [ ] `encuadres.job_posting_id` usa `ON DELETE SET NULL`.
- [ ] `worker_placement_audits.job_posting_id` usa `ON DELETE SET NULL`.
- [ ] Deletar um `job_posting` seta `job_posting_id = NULL` nas tabelas dependentes, sem deletar os registros.
- [ ] `job_postings` tem coluna `deleted_at TIMESTAMPTZ` com índice parcial.
- [ ] Todas as queries operacionais de `job_postings` filtram `WHERE deleted_at IS NULL`.
- [ ] `DECISIONS.md` documenta a política de arquivamento de job_postings.

### Testes unitários — validar implementação

- `test("Deletar job_posting: encuadre não é deletado")` — criar job_posting + encuadre, deletar job_posting, verificar que o encuadre existe com `job_posting_id = NULL`.
- `test("Deletar job_posting: audit não é deletado")` — criar job_posting + audit, deletar job_posting, verificar que o audit existe com `job_posting_id = NULL`.
- `test("deleted_at: job_posting arquivado não aparece em queries operacionais")` — setar `deleted_at`, verificar que não aparece nas listagens de vagas abertas.
- `test("Soft delete não afeta encuadres")` — setar `deleted_at` em job_posting, verificar que os encuadres relacionados continuam acessíveis.

### Testes de regressão — garantir que não volta

- `test("Nenhuma FK de auditoria com CASCADE")` — lint que detecta `ON DELETE CASCADE` em tabelas classificadas como auditoria (`*_audits`, `encuadres`, `blacklist`). Deve retornar 0.
- `test("Nenhuma query de job_postings sem filtro deleted_at")` — grep que detecta `FROM job_postings` sem `deleted_at IS NULL` em queries operacionais. Deve retornar 0.

---

## D7 — ~~🔵 DESIGN~~ COMPLETO: Ausência de histórico de mudanças de status dos workers

> **Resolvido em:** Migration 079 (`079_wave5_worker_status_history.sql`). Tabela `worker_status_history` criada com trigger `trg_worker_status_history`. Documentado no DECISIONS.md.
> **Codigo:** `OperationalRepositories.ts` implementa `SET LOCAL app.current_uid = $1` em `updateFunnelStage()` (linha ~888) e `updateOccupation()` (linha ~908) via transação, populando `changed_by` corretamente.
> **Testes:** `tests/e2e/wave5-enum-normalization.test.ts`

### Problema

Não existe tabela `worker_status_history`. Toda vez que um worker muda de `AVAILABLE → ACTIVE → INACTIVE`, o estado anterior é sobrescrito sem rastro. Isso impacta:

1. **Analytics**: não é possível calcular tempo médio em cada status, taxa de conversão por etapa do funil ou ciclos de contratação.
2. **Compliance**: em caso de auditoria, não há como provar quando um worker foi bloqueado (`BLACKLISTED`) ou qualificado (`QUALIFIED`).
3. **Debugging**: quando um worker está com status inesperado, não há histórico para entender o que aconteceu.

### Passo a passo de implementação

1. Criar tabela de histórico:

```sql
CREATE TABLE worker_status_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id     UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  field_name    VARCHAR(50) NOT NULL, -- 'status' | 'overall_status' | 'availability_status'
  old_value     VARCHAR(50),
  new_value     VARCHAR(50) NOT NULL,
  changed_by    VARCHAR(128),         -- Firebase UID do admin ou 'system'
  change_source VARCHAR(100),         -- 'admin_panel' | 'ana_care_sync' | 'import' | 'app'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_worker_status_history_worker
  ON worker_status_history(worker_id, created_at DESC);

CREATE INDEX idx_worker_status_history_field
  ON worker_status_history(field_name, new_value);
```

2. Criar trigger que popula automaticamente em qualquer UPDATE dos campos de status:

```sql
CREATE OR REPLACE FUNCTION fn_log_worker_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO worker_status_history (worker_id, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'status', OLD.status, NEW.status,
            current_setting('app.current_user', true));
  END IF;
  IF OLD.overall_status IS DISTINCT FROM NEW.overall_status THEN
    INSERT INTO worker_status_history (worker_id, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'overall_status', OLD.overall_status, NEW.overall_status,
            current_setting('app.current_user', true));
  END IF;
  IF OLD.availability_status IS DISTINCT FROM NEW.availability_status THEN
    INSERT INTO worker_status_history (worker_id, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'availability_status', OLD.availability_status, NEW.availability_status,
            current_setting('app.current_user', true));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_worker_status_history
  AFTER UPDATE OF status, overall_status, availability_status ON workers
  FOR EACH ROW EXECUTE FUNCTION fn_log_worker_status_change();
```

3. Configurar o backend para setar `app.current_user` antes de cada UPDATE em workers:

```typescript
await db.query("SET LOCAL app.current_user = $1", [firebaseUid]);
await db.query("UPDATE workers SET overall_status = $1 WHERE id = $2", [newStatus, workerId]);
```

### Critérios de aceite

- [ ] Tabela `worker_status_history` existe com índices.
- [ ] Trigger `trg_worker_status_history` dispara em UPDATE de qualquer dos 3 campos de status.
- [ ] Alterar `overall_status` de um worker cria linha em `worker_status_history`.
- [ ] `changed_by` é populado quando o backend seta `app.current_user`.

### Testes unitários — validar implementação

- `test("Mudança de overall_status cria histórico")` — atualizar `overall_status`, verificar linha em `worker_status_history`.
- `test("Sem mudança: sem histórico")` — UPDATE que não altera status não cria linha.
- `test("changed_by populado")` — setar `app.current_user` e verificar que o campo aparece no histórico.

### Testes de regressão — garantir que não volta

- `test("Trigger ativo em workers")` — verificar que `trg_worker_status_history` existe em `pg_trigger`.
- `test("Nenhuma atualização de status sem histórico")` — query de integridade que verifica workers com `overall_status != 'PRE_TALENTUM'` mas sem nenhuma entrada em `worker_status_history`. Alertar via n8n.

---

## 🔧 Seção 4 — Infraestrutura e Consistência Técnica

Inconsistências técnicas que não causam bugs de negócio imediatos mas violam o padrão do projeto e podem gerar dados corrompidos silenciosamente.

> **Status da seção:** 3/3 completos (I1, I2, I3). Migrations 067, 068, 088.

---

## I1 — ~~🔧 INFRAESTRUTURA~~ COMPLETO: Tabelas Talentum sem trigger `updated_at`

> **Resolvido em:** Migration 067 (`067_add_talentum_updated_at_triggers.sql`). Triggers criados para `talentum_prescreenings`, `talentum_questions` e `talentum_prescreening_responses` usando function `update_updated_at_column()`.
> **Testes:** `tests/e2e/wave5-enum-normalization.test.ts`

### Problema

A migration 057 criou `talentum_prescreenings`, `talentum_questions` e `talentum_prescreening_responses` com coluna `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, mas **não criou triggers** para auto-atualizar o campo. Todo o restante do projeto usa o trigger `update_updated_at_column()`. O resultado é que `updated_at` nessas tabelas sempre mostra o valor de criação, nunca a última atualização real — invalidando qualquer query que ordene ou filtre por registros modificados recentemente.

### Passo a passo de implementação

1. Criar os triggers faltantes:

```sql
CREATE TRIGGER talentum_prescreenings_updated_at
  BEFORE UPDATE ON talentum_prescreenings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER talentum_questions_updated_at
  BEFORE UPDATE ON talentum_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER talentum_prescreening_responses_updated_at
  BEFORE UPDATE ON talentum_prescreening_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

2. Verificar que todos os triggers foram criados:

```sql
SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE event_object_table LIKE 'talentum_%'
ORDER BY event_object_table;
-- Deve retornar 1 trigger por tabela
```

### Critérios de aceite

- [ ] `pg_trigger` contém triggers `updated_at` para as três tabelas Talentum.
- [ ] UPDATE em `talentum_prescreenings` atualiza `updated_at` automaticamente.

### Testes unitários — validar implementação

- `test("updated_at atualizado em UPDATE de talentum_prescreenings")` — criar registro, atualizar status, verificar que `updated_at > created_at`.
- `test("Triggers existem para todas as tabelas Talentum")` — query em `pg_trigger` para as 3 tabelas. Deve retornar 1 trigger por tabela.

### Testes de regressão — garantir que não volta

- `test("Toda nova tabela com updated_at tem trigger")` — migration linter que detecta tabelas com coluna `updated_at` sem trigger `BEFORE UPDATE` correspondente.

---

## I2 — ~~🔧 INFRAESTRUTURA~~ COMPLETO: `patient_addresses`, `patient_professionals` e `publications` sem coluna `updated_at`

> **Resolvido em:** Migration 068 (`068_add_updated_at_to_patient_and_publications.sql`). Coluna `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` adicionada às 3 tabelas. Triggers `BEFORE UPDATE` criados para cada uma.
> **Testes:** `tests/e2e/wave5-enum-normalization.test.ts`

### Problema

A migration 038 criou `patient_addresses` e `patient_professionals` **sem coluna `updated_at`**. A migration 014 criou `publications` também sem `updated_at`. Não há como auditar quando um endereço, profissional tratante ou publicação de vaga foi alterado — dado relevante para compliance LGPD e para debugging de sincronizações com ClickUp.

Todas as outras tabelas de entidades do sistema têm `updated_at`.

### Passo a passo de implementação

1. Adicionar colunas e triggers:

```sql
ALTER TABLE patient_addresses
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE patient_professionals
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE publications
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TRIGGER patient_addresses_updated_at
  BEFORE UPDATE ON patient_addresses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER patient_professionals_updated_at
  BEFORE UPDATE ON patient_professionals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER publications_updated_at
  BEFORE UPDATE ON publications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

2. Verificar que o valor default foi aplicado a todos os registros existentes:

```sql
SELECT COUNT(*) FROM patient_addresses   WHERE updated_at IS NULL;
SELECT COUNT(*) FROM patient_professionals WHERE updated_at IS NULL;
SELECT COUNT(*) FROM publications          WHERE updated_at IS NULL;
-- Todos devem retornar 0 (NOT NULL com DEFAULT garante isso)
```

### Critérios de aceite

- [ ] `patient_addresses` tem coluna `updated_at TIMESTAMPTZ NOT NULL`.
- [ ] `patient_professionals` tem coluna `updated_at TIMESTAMPTZ NOT NULL`.
- [ ] `publications` tem coluna `updated_at TIMESTAMPTZ NOT NULL`.
- [ ] Triggers `updated_at` existem para as três tabelas.
- [ ] UPDATE em `patient_addresses` atualiza `updated_at` automaticamente.

### Testes unitários — validar implementação

- `test("updated_at atualizado em UPDATE de patient_addresses")` — criar endereço, atualizar, verificar que `updated_at` foi modificado.
- `test("updated_at atualizado em UPDATE de patient_professionals")` — idem.
- `test("updated_at atualizado em UPDATE de publications")` — idem.

### Testes de regressão — garantir que não volta

- `test("Toda nova tabela de entidade tem updated_at")` — migration linter que detecta criação de tabela sem coluna `updated_at`.

---

## D8 — ~~🔵 DESIGN~~ COMPLETO: `messaging_outbox.variables` pode receber PII sem controle

> **Resolvido em:** Migration 086 (`086_wave7_d8_messaging_variable_tokens.sql`). Tabela `messaging_variable_tokens` criada. `OutboxProcessor.ts:102` chama `this.tokenService.resolveVariables()` para resolver tokens antes do envio. Documentado no DECISIONS.md.
> **Testes:** `tests/e2e/wave7-operational.test.ts`

### Problema

O campo `variables JSONB NOT NULL DEFAULT '{}'` em `messaging_outbox` armazena as variáveis de substituição do template de mensagem. Atualmente o único valor gravado é `{'name': 'Profissional'}` (placeholder genérico, migration 060). Porém, templates futuros com variáveis reais (`name`, `phone`, `location`, `case_details`) vão gravar PII em plaintext dentro deste JSONB sem nenhum controle.

Diferente de colunas nominadas (que o linter de PII detecta por nome), o JSONB é opaco para linters estáticos. O problema é preventivo agora mas se tornará regulatório assim que o primeiro template com dados reais for implantado.

### Passo a passo de implementação

1. Auditar os templates existentes em `message_templates` para identificar quais variáveis são esperadas e se alguma é PII:

```sql
SELECT slug, body FROM message_templates;
-- Identificar padrões {{name}}, {{phone}}, {{location}}, etc.
```

2. Definir política em `DECISIONS.md`: variáveis PII em `messaging_outbox.variables` devem ser tokenizadas (substituir o valor real por um token resolvido no momento do envio, não armazenado).

3. Criar tabela de tokens para variáveis sensíveis (se a política for tokenização):

```sql
CREATE TABLE messaging_variable_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token      VARCHAR(64) UNIQUE NOT NULL,
  field_name VARCHAR(100) NOT NULL,  -- ex: 'worker_phone', 'worker_name'
  worker_id  UUID REFERENCES workers(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

   Com essa abordagem, `variables` armazena `{'phone_token': 'tk_abc123'}` em vez de `{'phone': '+5491123456789'}`.

4. Atualizar o `MessagingService` para resolver tokens no momento do envio.

### Critérios de aceite

- [ ] `DECISIONS.md` define a política para variáveis PII em templates.
- [ ] Nenhum template com variável PII armazena o valor real em `messaging_outbox.variables`.
- [ ] O `MessagingService` resolve tokens antes de chamar a API Twilio.

### Testes unitários — validar implementação

- `test("Variável PII usa token, não valor real")` — disparar mensagem com `phone`, verificar que `variables` em `messaging_outbox` contém token, não o número real.
- `test("Token expirado não resolve")` — criar token expirado, tentar resolver, verificar erro.

### Testes de regressão — garantir que não volta

- `test("Linter de templates")` — ao adicionar novo template com variável contendo `phone`, `email`, `name`, exigir declaração explícita de que a variável é PII ou não-PII.

---

## D9 — ~~🔵 DESIGN~~ COMPLETO: Ausência de estratégia de retenção de dados

> **Resolvido em:** Migration 087 (`087_wave7_d9_retention_policy_index.sql`). Índice `idx_messaging_outbox_processed_at` criado. Functions `archive_old_messages()` e `cleanup_expired_tokens()` criadas para chamada via n8n. Política de retenção documentada no DECISIONS.md (messaging_outbox: 90 dias, bulk_dispatch: 1 ano, status_history: permanente).
> **Testes:** `tests/e2e/wave7-operational.test.ts`

### Problema

Três tabelas crescem indefinidamente sem política de arquivamento ou TTL:

| Tabela | Crescimento estimado | Impacto |
|---|---|---|
| `messaging_outbox` | 1 row por mensagem enviada | Full scans lentos em polling de pendentes |
| `whatsapp_bulk_dispatch_logs` | N rows por campanha em massa | Queries de auditoria ficam lentas |
| `worker_status_history` (após D7) | 3 rows por mudança de status por worker | Cresce com cada sync do Ana Care |

O índice parcial `WHERE status = 'pending'` em `messaging_outbox` mitiga a lentidão de polling, mas não resolve o crescimento da tabela nem o impacto em backups e pg_dump.

### Passo a passo de implementação

1. Definir políticas de retenção em `DECISIONS.md`:
   - `messaging_outbox`: manter 90 dias após `processed_at`. Registros `failed` após 30 dias.
   - `whatsapp_bulk_dispatch_logs`: manter 1 ano (compliance LGPD).
   - `worker_status_history`: manter permanentemente (auditoria regulatória).

2. Criar job de archiving no n8n para `messaging_outbox`:

```sql
-- Executar semanalmente
DELETE FROM messaging_outbox
WHERE status IN ('sent', 'failed')
  AND processed_at < NOW() - INTERVAL '90 days';
```

3. Para `whatsapp_bulk_dispatch_logs`, avaliar particionamento por `dispatched_at`:

```sql
-- Alternativa ao DELETE: particionar por mês
-- Requer recriação da tabela com PARTITION BY RANGE(dispatched_at)
```

4. Adicionar índice em `messaging_outbox.processed_at` para otimizar o job de archiving:

```sql
CREATE INDEX IF NOT EXISTS idx_messaging_outbox_processed_at
  ON messaging_outbox(processed_at)
  WHERE processed_at IS NOT NULL AND status IN ('sent', 'failed');
```

### Critérios de aceite

- [ ] `DECISIONS.md` documenta a política de retenção para cada tabela.
- [ ] Job de archiving existe no n8n e roda semanalmente.
- [ ] Índice em `messaging_outbox.processed_at` existe.
- [ ] Tamanho das tabelas é monitorado via alerta (ex: > 500k rows dispara notificação).

### Testes unitários — validar implementação

- `test("Job de archiving remove registros expirados")` — inserir registros com `processed_at` antigo, rodar job, verificar remoção.
- `test("Job de archiving preserva registros recentes")` — inserir registros recentes, rodar job, verificar que permanecem.

### Testes de regressão — garantir que não volta

- `test("Monitoramento de crescimento")` — query semanal que alerta se qualquer das tabelas rastreadas ultrapassar threshold de linhas.

---

## I3 — ~~🔧 INFRAESTRUTURA~~ COMPLETO: `job_postings.current_applicants` é contador desnormalizado

> **Resolvido em:** Migration 088 (`088_wave7_i3_drop_current_applicants_counter.sql`). Opção A implementada: coluna `current_applicants` e trigger `job_applicants_counter` removidos. Function `get_applicant_count()` criada para computação sob demanda. `VacanciesController.ts` atualizado para usar a function.
> **Testes:** `tests/e2e/wave7-operational.test.ts`

### Problema

O campo `current_applicants INTEGER DEFAULT 0` em `job_postings` é mantido por um trigger `job_applicants_counter` (migration 011). Se o trigger for desabilitado durante uma migration de dados em massa (prática comum para ganhar performance), ou se uma operação de INSERT/DELETE em `worker_job_applications` falhar a meio, o contador fica desatualizado silenciosamente. Não há mecanismo de reconciliação. O valor correto pode sempre ser computado via `COUNT(*)` em `worker_job_applications`.

### Passo a passo de implementação

**Opção A (recomendada) — Remover o contador e computar sob demanda:**

```sql
DROP TRIGGER IF EXISTS job_applicants_counter ON worker_job_applications;
ALTER TABLE job_postings DROP COLUMN IF EXISTS current_applicants;

-- Função helper para uso no código
CREATE OR REPLACE FUNCTION get_applicant_count(p_job_posting_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM worker_job_applications
  WHERE job_posting_id = p_job_posting_id;
$$ LANGUAGE SQL STABLE;
```

**Opção B — Manter contador com job de reconciliação:**

```sql
-- Job semanal de reconciliação
UPDATE job_postings jp
SET current_applicants = (
  SELECT COUNT(*) FROM worker_job_applications
  WHERE job_posting_id = jp.id
);
```

```sql
-- Query de alerta de divergência
SELECT jp.id, jp.current_applicants, COUNT(wja.id) AS real_count
FROM job_postings jp
LEFT JOIN worker_job_applications wja ON wja.job_posting_id = jp.id
GROUP BY jp.id, jp.current_applicants
HAVING jp.current_applicants != COUNT(wja.id);
```

### Critérios de aceite

- [ ] `DECISIONS.md` documenta a opção escolhida com racional.
- [ ] Se Opção A: o campo e o trigger não existem mais.
- [ ] Se Opção B: job de reconciliação existe no n8n; alerta de divergência configurado.

### Testes de regressão — garantir que não volta

- Se Opção B: `test("Sem divergência de current_applicants")` — query de integridade semanal. Deve retornar 0 rows divergentes.
