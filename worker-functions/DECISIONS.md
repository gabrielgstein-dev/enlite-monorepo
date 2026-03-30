# Enlite Worker Functions — Registro de Decisões

> Decisões técnicas documentadas como parte do roadmap de correção de schema.
> Cada entrada inclui: contexto, decisão, racional e data.

---

## Wave 1 — Diagnóstico de Schema (2026-03-29)

Executado via `scripts/wave1-diagnostic.js` contra banco local com seed de dados representativos.

### C1 — FK de `worker_job_applications.worker_id`

**Contexto:** O DDL exportado pelo DBeaver mostrava `REFERENCES <?>()` na FK de `worker_id`, sugerindo possível corrupção de metadado.

**Query executada:**
```sql
SELECT conname, conrelid::regclass, confrelid::regclass, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype = 'f' AND conrelid = 'worker_job_applications'::regclass;
```

**Resultado:** FK válida — `worker_job_applications_worker_id_fkey` aponta para `workers(id)` com `ON DELETE CASCADE`.

**Teste de integridade:** INSERT com `worker_id` inexistente retornou `ForeignKeyViolation` (código 23503) — FK funcional.

**Decisão:** Encerrar C1. O problema foi artefato do export do DBeaver, não do banco. Nenhuma migration necessária.

**Status:** CONCLUÍDO

---

### C2-D — `workers.whatsapp_phone` vs `phone`

**Contexto:** `whatsapp_phone VARCHAR(30)` (migration 007) ficou fora da migration 023 de criptografia de PII. Necessário auditar redundância com `phone` para decidir entre merge (dropar) ou encrypt (criptografar separadamente).

**Query executada:**
```sql
SELECT
  COUNT(*) AS total_workers,
  COUNT(*) FILTER (WHERE whatsapp_phone IS NOT NULL) AS com_whatsapp,
  COUNT(*) FILTER (WHERE whatsapp_phone IS NOT NULL AND phone = whatsapp_phone) AS identicos,
  COUNT(*) FILTER (WHERE whatsapp_phone IS NOT NULL AND phone != whatsapp_phone) AS diferentes,
  COUNT(*) FILTER (WHERE whatsapp_phone IS NOT NULL AND phone IS NULL) AS so_whatsapp
FROM workers;
```

**Resultado (dados locais):**
| Métrica | Valor |
|---------|-------|
| Total workers | 5 |
| Com whatsapp_phone | 4 |
| phone = whatsapp_phone | 3 (75%) |
| phone != whatsapp_phone | 1 (25%) |
| Só whatsapp (sem phone) | 0 |

**Nota importante:** Estes dados são de seed local. A decisão final (merge vs encrypt) deve ser validada com a query em produção (`enlite_ar`). Se >90% forem idênticos em prod, merge. Caso contrário, encrypt.

**Decisão preliminar:** ENCRYPT — há diferença não-trivial (25% no seed). O campo `whatsapp_phone` é PII e deve ser criptografado. Na Wave 2, criar migration para adicionar `whatsapp_phone_encrypted`, migrar dados e dropar plaintext.

**Pendência:** Executar a mesma query em produção para decisão definitiva.

**Status:** DIAGNÓSTICO CONCLUÍDO — aguardando validação em prod

---

### N8-C — `blacklist.reason` e `detail` — amostragem PII clínico

**Contexto:** Os campos `reason TEXT NOT NULL` e `detail TEXT` da tabela `blacklist` podem conter motivações clínicas em texto livre. O linter de PII do C2 não detecta este caso porque os nomes das colunas não contêm `email`, `phone`, `cpf`.

**Query executada:**
```sql
SELECT reason, detail FROM blacklist
WHERE reason ILIKE '%paciente%'
   OR reason ILIKE '%atendimiento%'
   OR reason ILIKE '%atendimento%'
   OR reason ILIKE '%familiar%'
   OR reason ILIKE '%crisis%'
   OR detail ILIKE '%paciente%'
   OR detail ILIKE '%familiar%'
LIMIT 20;
```

**Resultado:** 2 de 5 registros contêm PII clínico:
- `"Abandono de paciente en crisis"` — referência direta a estado clínico do paciente
- `"Comportamiento inadecuado durante atendimiento"` + detalhe mencionando familiar

**Decisão:** RECLASSIFICAR N8-C para CRITICO. Os campos `reason` e `detail` contêm informação clínica sobre a relação worker-paciente. Na Wave 2, criar migration para `reason_encrypted` e `detail_encrypted`, migrar dados via KMS e dropar plaintext. Expandir linter de PII para varredura semântica.

**Pendência:** Executar amostragem em produção para confirmar padrão. Implementar criptografia na Wave 2.

**Status:** DIAGNÓSTICO CONCLUÍDO — PII confirmado, reclassificado para CRITICO

---

## Wave 5 — Normalização de enums e status (2026-03-29)

### N1 — `profession` vs `occupation` — alinhamento de enums

**Contexto:** A migration 064 atualizou `profession` para valores em inglês (`AT`, `CAREGIVER`, `NURSE`, `KINESIOLOGIST`, `PSYCHOLOGIST`), mas `occupation` manteve os valores legacy em espanhol (`AT`, `CUIDADOR`, `AMBOS`). Isso causava divergência no matching.

**Decisão:**
- `CUIDADOR` → `CAREGIVER` (mapeamento direto)
- `AMBOS` → `NULL` (sem equivalente no novo enum; occupation representa profissão primária do sync externo)
- `profession` = profissão autodeclarada pelo worker no app Enlite (source of truth para matching)
- `occupation` = profissão registrada via sync Ana Care (pode divergir de profession)
- View `workers_profession_divergence` criada para monitoramento operacional

**Racional para `AMBOS → NULL`:** O campo `occupation` representa a profissão primária do sync externo. Sem equivalente no novo enum, o valor fica nulo até próximo sync do Ana Care.

**Migration:** 076_wave5_align_occupation_to_profession.sql

**Status:** IMPLEMENTADO

---

### N5 — `worker_eligibility` — view materializada de elegibilidade

**Contexto:** Workers tem 4 campos de status (`status`, `overall_status`, `availability_status`, `ana_care_status`). Sem definição centralizada de "worker elegível para matching", cada dev implementava combinação ad-hoc.

**Decisão:**
- Materialized view `worker_eligibility` com `is_matchable` e `is_active`
- `is_matchable = true` quando: `status = 'approved'` AND `overall_status IN ('QUALIFIED', 'ACTIVE', 'HIRED', 'MESSAGE_SENT')` AND `availability_status IS NULL OR IN ('AVAILABLE', 'ACTIVE')` AND `deleted_at IS NULL`
- `is_active = true` quando: `status = 'approved'` AND `overall_status NOT IN ('BLACKLISTED', 'INACTIVE')` AND `deleted_at IS NULL`
- `ana_care_status` documentado como campo bruto — nunca usar para matching

**Migration:** 077_wave5_worker_eligibility_view.sql

**Status:** IMPLEMENTADO

---

### N6 — `application_funnel_stage` vs `application_status` — mapeamento

**Contexto:** Dois campos rastreiam progresso de candidatura com valores sobrepostos. Sem definição de qual é canônico para cada propósito.

**Decisão:**
- `application_funnel_stage` = campo de negócio, visível na UI, conduzido pelo recrutador
- `application_status` = campo técnico sistêmico para integrações e automações
- Mapeamento `FUNNEL_TO_STATUS` definido como constante TypeScript no domain layer (`src/domain/entities/WorkerJobApplication.ts`)
- Mapeamento: APPLIED→applied, PRE_SCREENING→under_review, INTERVIEW_SCHEDULED→interview_scheduled, INTERVIEWED→under_review, QUALIFIED→approved, REJECTED→rejected, HIRED→hired

**Migration:** 078_wave5_funnel_to_status_comments.sql

**Status:** IMPLEMENTADO

---

### D7 — `worker_status_history` — auditoria de mudanças de status

**Contexto:** Toda mudança de status de worker sobrescreve o valor anterior sem rastro. Impacta analytics, compliance e debugging.

**Decisão:**
- Tabela `worker_status_history` com campos: worker_id, field_name, old_value, new_value, changed_by, change_source, created_at
- Trigger `trg_worker_status_history` dispara automaticamente em UPDATE de `status`, `overall_status`, `availability_status`
- `changed_by` populado via `current_setting('app.current_uid', true)` — backend deve setar antes de cada UPDATE
- `change_source` para rastreabilidade (admin_panel, ana_care_sync, import, app)

**Migration:** 079_wave5_worker_status_history.sql

**Status:** IMPLEMENTADO

---

## Wave 7 — Operacional (2026-03-29)

### D1 — geography em worker_service_areas

**Contexto:** `worker_locations` (AR) tem coluna `location geography GENERATED ALWAYS` para uso com `ST_DWithin` (migration 048). `worker_service_areas` (BR) tem `lat/lng` mas **não** tinha a coluna geography gerada. O matching geográfico funcionava de forma diferente para workers AR vs BR.

**Decisão:** Adicionar coluna geography gerada automaticamente em `worker_service_areas`, com índice GIST, alinhando com o padrão já existente em `worker_locations`.

**Racional:** Unificar o padrão de geography para que `ST_DWithin` funcione da mesma forma em ambas as tabelas. Sem isso, qualquer lógica de matching geográfico precisaria tratar AR e BR de forma diferente.

**Migration:** 084_wave7_d1_geography_worker_service_areas.sql

**Status:** IMPLEMENTADO

---

### D2 — Três mecanismos de rastreamento de mensagens

**Contexto:** O sistema tem três lugares que registram envios de mensagens WhatsApp:
1. `messaging_outbox` — fila transacional com retry (mensagens individuais sobre candidaturas específicas)
2. `whatsapp_bulk_dispatch_logs` — log imutável de campanhas em massa (disparo em lote, sem retry)
3. `worker_job_applications.messaged_at` — denormalização para UI (badge "Já notificado"), deve ser atualizada apenas após envio **confirmado** via callback Twilio

**Decisão:**
- Documentar propósitos via `TABLE COMMENT` no banco
- Alterar `worker_id` FK para `ON DELETE SET NULL` em ambas as tabelas (não bloquear exclusão de workers com histórico)
- `messaged_at` só deve ser atualizado após confirmação de entrega (não no momento do envio)
- Bulk dispatch opera independentemente de `messaging_outbox` — `twilio_sid` de bulk nunca aparece em `messaging_outbox`

**Racional:** O default PostgreSQL (`RESTRICT`) bloqueava silenciosamente a exclusão de qualquer worker com histórico de mensagens. `SET NULL` preserva o registro de auditoria enquanto permite a exclusão. As tabelas de mensagens operam em domínios separados (individual vs massa) e não precisam de FK entre si.

**Migration:** 085_wave7_d2_messaging_comments_on_delete.sql

**Status:** IMPLEMENTADO

---

### D8 — Tokenização de variáveis PII em messaging_outbox.variables

**Contexto:** O campo `variables JSONB` em `messaging_outbox` armazena variáveis de substituição de templates. Atualmente usa placeholder genérico `{'name': 'Profissional'}`, mas templates futuros com `name`, `phone`, `location` gravariam PII em plaintext no JSONB — opaco para linters estáticos.

**Decisão:** Criar tabela `messaging_variable_tokens` com tokens temporários (TTL 24h). Variáveis PII em `variables` usam tokens (`{'phone_token': 'tk_abc123'}`) em vez de valores reais. O `MessagingService` resolve token → valor no momento do envio.

**Racional:** Abordagem preventiva antes que o primeiro template com dados reais seja implantado. Tokens expiram em 24h para minimizar janela de exposição. Se o envio falhar e for retentado, o token pode ser regenerado.

**Migration:** 086_wave7_d8_messaging_variable_tokens.sql

**Status:** IMPLEMENTADO

---

### D9 — Política de retenção de dados

**Contexto:** Três tabelas crescem indefinidamente sem política de archivamento:
- `messaging_outbox`: 1 row por mensagem enviada
- `whatsapp_bulk_dispatch_logs`: N rows por campanha em massa
- `worker_status_history`: 3 rows por mudança de status por worker

**Decisão:**
- `messaging_outbox`: manter 90 dias após `processed_at`. Registros `sent`/`failed` removidos pelo job.
- `whatsapp_bulk_dispatch_logs`: manter 1 ano (365 dias — compliance LGPD).
- `worker_status_history`: manter permanentemente (auditoria regulatória).
- Função `archive_old_messages(outbox_days, bulk_days)` criada para ser chamada pelo n8n semanalmente.
- Função `cleanup_expired_tokens()` para limpar tokens PII expirados.
- Índice em `messaging_outbox.processed_at` para otimizar o DELETE do job de archiving.

**Racional:** O índice parcial `WHERE status = 'pending'` mitiga polling lento, mas não resolve crescimento de tabela. A função SQL é preferível a um script externo pois executa no mesmo contexto transacional do banco.

**Migration:** 087_wave7_d9_retention_policy_index.sql

**Status:** IMPLEMENTADO

---

### I3 — Contador desnormalizado `current_applicants`

**Contexto:** O campo `current_applicants INTEGER DEFAULT 0` em `job_postings` era mantido pelo trigger `job_applicants_counter` (migration 011). Se o trigger fosse desabilitado durante bulk imports ou uma operação falhasse a meio, o contador ficava desatualizado silenciosamente.

**Decisão:** Opção A — Remover o contador e computar sob demanda via função `get_applicant_count(job_posting_id)` que faz `COUNT(*)` em `worker_job_applications`.

**Racional:** O valor correto é sempre derivável via COUNT(*). A quantidade de candidatos por vaga é pequena (< 50), então a performance do COUNT é negligível. Elimina toda uma classe de bugs de desincronização entre trigger e realidade.

**Código atualizado:** `VacanciesController.ts` agora usa `get_applicant_count(jp.id)` no SELECT em vez de `jp.current_applicants`.

**Migration:** 088_wave7_i3_drop_current_applicants_counter.sql

**Status:** IMPLEMENTADO
