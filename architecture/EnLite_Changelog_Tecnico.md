# EnLite — Registro de Alterações Técnicas

Documento interno de engenharia. Não faz parte da documentação para gerência.

---

## Alterações realizadas durante a elaboração da arquitetura

### Correções de SQL

| Problema | Correção |
|---|---|
| Função `resolve_permission` tinha `DECLARE` aninhado (PL/pgSQL inválido) | Reescrita sem nested DECLARE |
| `SELECT ... INTO v_resource_id, allowed` — `allowed` é coluna de output, não variável | Corrigido para `INTO v_resource_id, v_mask` |
| `user_permission_overrides.expires_at` é `NOT NULL` mas a função checava `IS NULL` | Removido o check `IS NULL` |
| 11 tabelas sem Row-Level Security (vazamento cross-tenant) | RLS adicionado: addresses, patient_proxies, scheduling_preferences, 5 tabelas de provider, platform_contracts, security_incidents, entity_agreements |
| `GRANT ALL ON ALL TABLES IN SCHEMA iam` permitia app modificar próprias permissões | Substituído por GRANTs granulares — app_service tem SELECT em permission tables; modificações requerem `permission_admin_sa` |
| GRANTs faltando para tabelas de permissão | Adicionados |
| Recursão infinita possível em `resolve_permission` (parent circular) | Parâmetro `p_depth` com max=5 |
| Função `resolve_permission` sem sanitização de inputs (risco com SECURITY DEFINER) | Regex validation no resource_key e action_key |
| 4 tabelas com `updated_at` sem trigger automático | Triggers adicionados: insurance_plans, payer_provider_contracts, platform_contracts, patient_eligibility |
| Índices faltando em `data_subject_requests` | Adicionados: status+jurisdiction, deadline_at parcial, user_id |
| `compliance.consents.consent_type` era text livre | Padronizado com CHECK de 8 tipos específicos |
| `compliance.permission_audit_log` sem RLS | RLS adicionado |
| Redis `KEYS` pattern (bloqueia produção) | Substituído por Redis Sets com invalidação granular |

### Correções de compliance

| Problema | Correção |
|---|---|
| Workforce Security Training (HIPAA 45 CFR 164.308(a)(5)) não mencionado | Seção 0.6 adicionada |
| Sanction Policy (HIPAA 45 CFR 164.308(a)(1)(ii)(C)) ausente | Seção 0.7 adicionada |
| Emergency Access Procedure (HIPAA 45 CFR 164.312(a)(2)(ii)) ausente | Documentado no Risk Analysis + campo `is_emergency_access` na tabela de logs |
| Automatic Logoff (HIPAA 45 CFR 164.312(a)(2)(iii)) não especificado | Documentado: JWT 1h, refresh 24h, backoffice 15min inatividade |
| MFA não implementado | Campo `mfa_enabled` em `iam.users` + documentado no Risk Analysis |
| Breach notification incompleto | Workflow automatizado + campos de deadline por jurisdição na tabela de incidentes |
| Media Disposal (HIPAA 45 CFR 164.310(d)(2)) ausente | Seção 0.12 adicionada |
| Contingency plan testing não mencionado | Tabletop exercise anual documentado |
| Record of Processing Activities (LGPD Art. 37; GDPR Art. 30) ausente | Seção 0.9 com inventário por fluxo |
| Data portability sem formato de exportação | Campos `export_format`, `export_url` em data_subject_requests |
| Right to erasure sem workflow de propagação | Pub/Sub `consent.revoked` + `data.deletion.requested` documentados |
| Cross-border transfer sem SCCs | Documentado em seção GDPR + inventário |
| Consent revocation sem propagação (LGPD Art. 18 VI; GDPR Art. 7(3)) | Workflow de propagação por tipo de consentimento via Pub/Sub |
| Accounting of Disclosures (HIPAA 45 CFR 164.528) ausente | Endpoint e mapeamento documentados |
| Ley 25.326 (Argentina) sem requisitos específicos | Seção 0.4 com 5 requisitos + retention policies |
| Privacy by Design (GDPR Art. 25) não documentada formalmente | Tabela de mapeamento decisão→princípio→artigo |
| Org permission override sem guardrail para dados restritos | `resolve_permission` bloqueia override em recursos `restricted` sem `approved_by` |

### Correções de conflito entre documentos

| Problema | Correção |
|---|---|
| Cerbos YAML estático conflitava com sistema database-driven | Eliminado YAML; tudo via banco + Cerbos Admin API |
| `user_context` criado sem `organization_id` | Incluído no CREATE TABLE original |
| `addresses` criado sem `organization_id` | Incluído no CREATE TABLE original |
| `organizations` criado sem `fhir_organization_id` | Incluído no CREATE TABLE original |
| Resource keys inconsistentes entre documentos | Padronizado |
| Roles duplicados entre documentos | Unificado em seed com 15 roles |
| Estratégia multi-region / data residency inexistente | Seção 2.1 com decisão documentada + plano de migração |
