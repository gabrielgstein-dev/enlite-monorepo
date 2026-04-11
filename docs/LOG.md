# Log de Bordo — Enlite Infra

Registro cronológico de incidentes, hotfixes e decisões operacionais.

---

## 2026-04-11 — Hotfix: CHECK constraint `talentum_prescreenings.status`

**Incidente**: 5 erros 500 consecutivos no webhook `POST /api/webhooks/talentum/prescreening` entre 16:17 e 16:44 (UTC-3) do dia 10/04.

**Causa raiz**: O commit `dcb219b` (10/04) introduziu lógica que grava o `statusLabel` do Talentum (`QUALIFIED`, `NOT_QUALIFIED`, `IN_DOUBT`, `PENDING`) diretamente na coluna `status` de `talentum_prescreenings`. Porém, a migration correspondente para expandir o CHECK constraint **não foi criada** — o constraint (migration 091) só aceitava `INITIATED`, `IN_PROGRESS`, `COMPLETED`, `ANALYZED`.

**Impacto**: 5 candidatas com `statusLabel=QUALIFIED` não tiveram o status e o funnel stage atualizados:

| Candidata | Caso | extId |
|---|---|---|
| maidatater70@gmail.com | CASO 743 | `69c186d4ceb321ebd150bccf` |
| fateba621@gmail.com | CASO 429 | `68f235d16b060cf8302bef9c` |
| fateba621@gmail.com | CASO 611 | `68f235d16b060cf8302befc4` |
| elinabalduccisaavedra@gmail.com | CASO 119 | `68f235d16b060cf8302befbf` |
| gabrielasu22@gmail.com | CASO 707 | `69728055299756855851ee88` |

**Correção aplicada**:

1. **Migration 129** (`129_expand_prescreening_status_check.sql`): expandiu o CHECK constraint para aceitar todos os 8 valores possíveis: `INITIATED`, `IN_PROGRESS`, `COMPLETED`, `ANALYZED`, `QUALIFIED`, `NOT_QUALIFIED`, `IN_DOUBT`, `PENDING`.

2. **Dados corrigidos manualmente** via `psql` no Cloud SQL:
   - `UPDATE talentum_prescreenings SET status = 'QUALIFIED'` para os 5 registros afetados.
   - `UPDATE worker_job_applications SET application_funnel_stage = 'QUALIFIED'` para as 5 WJAs correspondentes.

3. **Testes de regressão** adicionados (commit `43d4bed`):
   - 7 unit tests em `ProcessTalentumPrescreening.test.ts`: validam que todo `effectiveStatus` produzido pelo código está no array `VALID_DB_STATUSES`.
   - 2 E2E tests em `talentum-prescreening.test.ts`: INSERT real no banco com cada status possível — qualquer valor faltando no constraint quebra o teste.

**Lição aprendida**: Toda alteração de lógica que muda os valores gravados em colunas com CHECK constraint **deve incluir a migration correspondente no mesmo commit**. Os testes de regressão agora garantem sincronia entre código e banco.
