# Roadmap — Resolução dos Gaps de Codigo do Schema

> **Criado em:** 2026-03-30
> **Concluido em:** 2026-03-30
> **Contexto:** Auditoria rigorosa do `roadmap_enlite_schema.md` identificou gaps onde migrations foram aplicadas corretamente mas o codigo de aplicação não foi atualizado.

---

## Resumo

| GAP | ID Original | Severidade | Status | Testes E2E |
|-----|------------|------------|--------|------------|
| 1 | D6 | CRITICA | **RESOLVIDO** — ~25 queries em 9 arquivos | 16 testes |
| 2 | N5 | CRITICA | **RESOLVIDO** | 6 testes |
| 3 | C3 | ALTA | **RESOLVIDO** | 7 testes |
| 4 | N8-C | ALTA | **RESOLVIDO** — BlacklistRepo + WorkerDeduplicationService | 7 testes |
| **TOTAL** | | | **4/4 RESOLVIDOS** | **36 testes passando** |

> Arquivo de testes: `tests/e2e/schema-gaps-resolution.test.ts`

---

## GAP 1 — D6: ~~Adicionar filtro `deleted_at IS NULL` em todas as queries de `job_postings`~~ RESOLVIDO

> **Resolvido em:** 2026-03-30
> **Testes E2E:** 16 testes (com dados + banco vazio) — todos passando

### O que foi feito

Adicionado `deleted_at IS NULL` em **todas** as queries operacionais de `job_postings` em 9 arquivos:

| Arquivo | Queries corrigidas | Detalhes |
|---------|-------------------|----------|
| `RecruitmentController.ts` | 12 | `getClickUpCases`, `getPublications` (query + count), `getEncuadres`, `getGlobalMetrics`, `getCaseAnalysis` (6 sub-queries), `getZoneAnalysis`, `calculateReemplazos` |
| `VacanciesController.ts` | 2 | `listVacancies`, `getVacanciesStats` |
| `ClickUpCaseRepository.ts` | 3 | `findActiveCases`, `findByCaseNumber`, `countByZone` |
| `OperationalRepositories.ts` | 5 | `countByChannel`, `findLastPublicationPerCase`, `linkJobPostingsByCaseNumber`, `countCandidatesByCaseNumber`, `countPostuladosByCaseNumber` |
| `EncuadreRepository.ts` | 3 | `findByWorkerId`, `countAttended` (com filtro country), `countSelAndRemByCaseNumber` |
| `AnalyticsRepository.ts` | 4 | Worker vacancies (2 queries), `getWorkerOtherVacancies` (2 queries) |
| `TalentumWebhookController.ts` | 1 | `findByTitleILike` |
| `import-planilhas.ts` | 1 | `buildJobPostingCaseCache` |

**Regra aplicada por tipo de JOIN:**

| Tipo | Onde foi colocado o filtro |
|---|---|
| `FROM job_postings jp WHERE ...` | `AND jp.deleted_at IS NULL` no WHERE |
| `INNER JOIN job_postings jp ON ...` | `AND jp.deleted_at IS NULL` na condição do JOIN |
| `LEFT JOIN job_postings jp ON ...` | `AND jp.deleted_at IS NULL` na condição do JOIN (preserva rows sem match) |

**Exceções intencionais (sem filtro):**

| Query | Motivo |
|---|---|
| `loadAndEnrichJob()` (MatchmakingService) | Busca por `jp.id = $1` — lookup por PK de uma vaga ja conhecida |
| `getVacancyById()` (VacanciesController) | Admin pode visualizar detalhes de vaga deletada por ID |
| `enrichJobPosting()` (JobPostingEnrichmentService) | Busca por `jp.id = $1` — enriquecimento de uma vaga especifica |
| `getTalentumWorkers()` (RecruitmentController) | Query principal é de workers, LEFT JOIN com job_postings é informacional |

### Criterios de aceite — TODOS ATENDIDOS

- [x] Todas as queries operacionais de `job_postings` incluem filtro `deleted_at IS NULL`
- [x] Encuadres com `job_posting_id = NULL` (de job_postings deletados) continuam visíveis
- [x] Grep confirma zero queries sem filtro (exceções documentadas acima)
- [x] 16 testes E2E passam (incluindo cenarios com dados e banco vazio)

---

## GAP 2 — N5: ~~Integrar `worker_eligibility` no MatchmakingService~~ RESOLVIDO

> **Resolvido em:** 2026-03-30
> **Testes E2E:** 6 testes — todos passando

### O que foi feito

1. **INNER JOIN** `worker_eligibility we ON we.id = w.id` adicionado no `hardFilter()` (linha ~384)
2. **Filtro** `we.is_matchable = TRUE` substituiu checks inline de `availability_status` (linha ~388)
3. **`bl.id IS NULL`** mantido separado (blacklist pode ter entradas mais recentes que o ultimo refresh da view)
4. **`REFRESH MATERIALIZED VIEW CONCURRENTLY worker_eligibility`** chamado no inicio de `matchWorkersForJob()` (linha ~164)
5. Checks inline de `availability_status IS NULL OR IN ('AVAILABLE', 'ACTIVE')` **removidos**

### Criterios de aceite — TODOS ATENDIDOS

- [x] `hardFilter()` faz INNER JOIN com `worker_eligibility`
- [x] Filtro `we.is_matchable = TRUE` substitui checks inline de status
- [x] Workers com `status != 'approved'` não aparecem no matching
- [x] Workers com `overall_status = 'BLACKLISTED'` não aparecem
- [x] Workers soft-deleted não aparecem
- [x] View é refreshada antes do matching
- [x] 6 testes E2E passam

---

## GAP 3 — C3: ~~Migrar 3 repositorios para usar `coordinator_id`~~ RESOLVIDO

> **Resolvido em:** 2026-03-30
> **Testes E2E:** 7 testes — todos passando

### O que foi feito

1. **Helper** `resolveCoordinatorId()` criado como função standalone (linhas 14-27) — findOrCreate pattern com `INSERT...ON CONFLICT`
2. **CoordinatorScheduleRepository.upsert()** — popula `coordinator_id`, ON CONFLICT usa `(coordinator_id, from_date, to_date)`
3. **PlacementAuditRepository.upsert()** — popula `coordinator_id`, COALESCE no ON CONFLICT
4. **JobPostingARRepository.upsertByCaseNumber()** — popula `coordinator_id`, COALESCE no ON CONFLICT
5. **RecruitmentController.getClickUpCases()** — `LEFT JOIN coordinators c ON c.id = jp.coordinator_id`, `c.name AS coordinator_name`
6. **RecruitmentController.getEncuadres()** — `LEFT JOIN coordinators c ON c.id = e.coordinator_id`, `c.name AS coordinator_name`
7. **findByCoordinatorAndDate()** — usa subquery `WHERE coordinator_id = (SELECT id FROM coordinators WHERE name ILIKE $1)`

### Criterios de aceite — TODOS ATENDIDOS

- [x] `resolveCoordinatorId()` helper existe e faz findOrCreate
- [x] Os 3 repos populam `coordinator_id` em INSERT/UPSERT
- [x] `RecruitmentController` faz JOIN com `coordinators` nos SELECTs
- [x] Novos registros têm `coordinator_id` NOT NULL quando `coordinator_name` é fornecido
- [x] `findByCoordinatorAndDate()` usa `coordinator_id`
- [x] 7 testes E2E passam

---

## GAP 4 — N8-C: ~~Integrar KMS no BlacklistRepository~~ RESOLVIDO

> **Resolvido em:** 2026-03-30
> **Testes E2E:** 7 testes — todos passando

### O que foi feito

#### BlacklistRepository (OperationalRepositories.ts)

1. **KMSEncryptionService injetado** no constructor (linha ~57-61)
2. **upsert() path 1** (com worker_id) — encripta `reason` e `detail` antes do INSERT, dual-write plaintext + encrypted (linhas ~66-86)
3. **upsert() path 2** (orfão) — mesmo padrão dual-write (linhas ~88-106)
4. **mapRow() convertido para async** — descriptografa `reason_encrypted` e `detail_encrypted` com fallback para plaintext legado (linhas ~153-172)
5. **findByWorkerId()** — usa `Promise.all(result.rows.map(row => this.mapRow(row)))` (linha ~114)
6. **Script de migração** `scripts/migrate-blacklist-pii.ts` criado — migra dados legados em batches de 100 com validação final

#### WorkerDeduplicationService (RESIDUAL CORRIGIDO)

7. **mergeWorkers()** — INSERT...SELECT agora copia `reason_encrypted` e `detail_encrypted` junto com plaintext (linhas ~415-419)
8. **ON CONFLICT** corrigido para `(worker_id, reason) WHERE worker_id IS NOT NULL` — compativel com o partial unique index `idx_blacklist_worker_reason`

### Criterios de aceite — TODOS ATENDIDOS

- [x] `BlacklistRepository` tem `KMSEncryptionService` injetado
- [x] INSERT/UPDATE encripta `reason` e `detail` antes de gravar
- [x] SELECT descriptografa `reason_encrypted` e `detail_encrypted`
- [x] Fallback para plaintext existe (dados legados)
- [x] Script de migração de dados legados existe e valida cobertura
- [x] `mapRow()` é async e todos os call sites usam `await`
- [x] `WorkerDeduplicationService.mergeWorkers()` copia colunas encrypted
- [x] 7 testes E2E passam (incluindo merge com validação de encrypted)

---

## Correções adicionais feitas durante a implementação

| Item | Arquivo | O que foi feito |
|---|---|---|
| Migrations 089, 090 | `migrations/089_*.sql`, `migrations/090_*.sql` | Removido `INSERT INTO schema_migrations (version, name)` incompativel com o migration runner Docker |
| Setup E2E | `tests/e2e/setup.ts` | Adicionadas tabelas `coordinator_weekly_schedules`, `worker_placement_audits`, `coordinators` ao TRUNCATE |

---

## Proximos passos (futuro)

- **GAP 4 Fase 2:** Apos script de migração rodar em produção com 0 registros faltando, criar migration `091_wave8_drop_blacklist_plaintext.sql` para dropar colunas `reason` e `detail` plaintext
- **Monitoramento:** Verificar em produção que `SELECT COUNT(*) FROM blacklist WHERE reason IS NOT NULL AND reason_encrypted IS NULL` = 0 antes de dropar
