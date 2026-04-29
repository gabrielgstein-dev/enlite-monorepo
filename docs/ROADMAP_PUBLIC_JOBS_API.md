# Roadmap: Endpoint Público de Vagas — SUPERSEDED

> ⚠️ **Este documento foi substituído em 2026-04-27 por** [`docs/SPRINT_VACANCIES_REFACTOR.md`](./SPRINT_VACANCIES_REFACTOR.md).
>
> Mantido aqui apenas como **referência histórica** do escopo original (apenas o endpoint público).
> Após a auditoria de 2026-04-27, ficou claro que o endpoint não é viável sem refatorar o schema de vagas primeiro — o sprint maior cobre 10 fases (refactor de schema, match address bloqueante, expansão do patient mapper, status normalization, e por fim o endpoint).

## Resumo do escopo histórico (não executar daqui)

- Status: **superado** pelo SPRINT_VACANCIES_REFACTOR.md
- Decisões originais que **continuam valendo** (e estão expandidas no doc novo):
  - Contrato `PublicJobDto` com 12 campos (sem `whatsappLink`)
  - `detailLink` = `social_short_links.site` (Short.io canal site)
  - Filtro `status IN ('SEARCHING','SEARCHING_REPLACEMENT','RAPID_RESPONSE') AND social_short_links ? 'site'`
  - Cache-Control 5min + ETag + rate limit 60 rpm/IP
  - Sem CORS (consumo server-side via PHP)
  - Util Short.io modularizado em `ShortIoClient` + `ShortLinkService` + `EnsureVacancyShortLinkUseCase`
- Decisões que **mudaram** após auditoria de 2026-04-27:
  - Status normalization deixou de ser "Etapa 0" cirúrgica e virou parte de um sprint maior (10 fases)
  - Schema de `job_postings` será refatorado (FK `patient_address_id`, drop de colunas duplicadas)
  - Source of truth dos dados clínicos passa a ser `patients.*` (com sobrescrita só sob consentimento explícito)
  - Endpoint público fica bloqueado até a fila de revisão manual (Fase 8 do novo doc) zerar

## Onde ler agora

→ [`docs/SPRINT_VACANCIES_REFACTOR.md`](./SPRINT_VACANCIES_REFACTOR.md)
