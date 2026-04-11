# Log de Bordo — Enlite Infra

Registro cronológico de incidentes, hotfixes e decisões operacionais.

---

## 2026-04-11 — Operacional: Short link + WordPress para vaga 230

**Objetivo**: Substituir o link direto do WhatsApp no botão "Me Interesa" do WordPress (jobs.enlite.health) por um short link com UTM tracking, permitindo rastrear workers vindos do site via `acquisition_channel`.

**Contexto**: A vaga do caso 230 (vacancy_number 290, TEA, Argentina) já estava publicada no WordPress com link direto `wa.me/...` no botão "Me Interesa". Esse link levava o worker direto ao WhatsApp, sem passar pela `PublicVacancyPage` — logo, o `utm_source` nunca era capturado e o canal de aquisição se perdia.

**Ações realizadas**:

1. **Short link criado via Short.io API** (direto, sem passar pelo backend):
   - URL: `https://go.enlite.health/ho0pF8`
   - Destino: `https://app.enlite.health/vacantes/caso230-290?utm_source=portal_jobs&utm_medium=vacante&utm_campaign=230&utm_id=recrutamento&utm_term=AR&utm_content=TEA+(Trastorno+del+Espectro+Autista)`
   - Canal: `site` (utm_source=portal_jobs)

2. **Banco atualizado** (`job_postings.social_short_links`):
   - Executado via `run-migration-prod.sh` com SQL one-off (não migration permanente).
   - `social_short_links = {"site": {"url": "https://go.enlite.health/ho0pF8", "id": "lnk_56rR_8WlEZ0bmguK6FOWUw1UFu"}}`

3. **WordPress atualizado** (campo `me_interessa_link` no post 393082):
   - REST API do WP não expõe campos custom (ACF/metabox) para `vagas_ar` — não foi possível atualizar via REST.
   - XMLRPC bloqueado pelo Cloudflare (erro 520).
   - Solução: login via `wp-login.php` com credenciais reais, extração do nonce do form de edição, e POST para `post.php` simulando o submit do formulário admin.
   - Link antigo: `https://wa.me/5491127227852?text=Hola!%20Estoy%20interesado%20...`
   - Link novo: `https://go.enlite.health/ho0pF8`

**Verificação**: Página pública `jobs.enlite.health/es/vagas/230/` confirmada com ambos botões "Me Interesa" apontando para o short link.

**Fluxo resultante**: Worker clica "Me Interesa" no WordPress → short link redireciona para `PublicVacancyPage` com `utm_source=portal_jobs` → frontend captura canal e salva em sessionStorage → ao postular-se, canal é enviado ao backend como `acquisition_channel=site`.

**Nota técnica**: O template Elementor "Single Vagas (AR)" (ID 21235) usa dynamic tag `post-custom-field` apontando para `me_interessa_link`. Cada post `vagas_ar` tem seu próprio valor nesse campo. Para futuras vagas, o campo precisa ser preenchido com o short link correspondente.

---

## 2026-04-11 — Hotfix: Deploy falhando por race condition no migration runner

**Incidente**: Vaga do caso 230 não aparecia no filtro de vagas do painel admin, apesar de existir no banco com status `ACTIVO`.

**Investigação**:

1. Query direta no banco retornava a vaga normalmente com `case_number=230`, `vacancy_number=290`, `status=ACTIVO`.
2. Curl na API de produção retornava `data: [], total: 0` para busca "230".
3. Listagem completa sem filtro de busca retornava 107 vagas — banco direto retornava 159. Diferença de 52 vagas (exatamente as que tinham status `ACTIVO`, `EQUIPO RESPUESTA RAPIDA`, `ACTIVACION PENDIENTE`).
4. Commit `d36bba5` (do mesmo dia) já corrigia o filtro adicionando esses status. A imagem Docker tinha a tag correta desse commit.

**Causa raiz**: A revisão Cloud Run `00188-nlz` (com o fix) **falhou no startup** e nunca recebeu tráfego. O tráfego ficou na revisão anterior `00187-9nc` (de 10/04), que não incluía os status em espanhol no filtro.

A falha no startup foi causada por **race condition no migration runner**: Cloud Run iniciou 2 instâncias simultaneamente para a nova revisão. Ambas executaram `run-migrations-docker.js` ao mesmo tempo. A primeira aplicou as migrations 129 e 130 com sucesso. A segunda tentou inserir o mesmo registro em `schema_migrations` e recebeu `duplicate key value violates unique constraint "schema_migrations_pkey"`, chamando `process.exit(1)` e matando o container.

```
✅ Applied: 129_expand_prescreening_status_check.sql
✅ Applied: 130_add_acquisition_channel.sql
🎉 Migrations complete — 2 applied, 130 skipped.
❌ Failed: 130_add_acquisition_channel.sql          ← segunda instância
duplicate key value violates unique constraint "schema_migrations_pkey"
Container called exit(1).
```

**Correção aplicada** (commit `711e575`):

Adicionado `pg_try_advisory_lock` no migration runner (`worker-functions/scripts/run-migrations-docker.js`). Quando múltiplas instâncias Cloud Run iniciam simultaneamente, apenas a primeira que adquirir o lock executa as migrations — as demais pulam com mensagem `⏳ Another instance is running migrations — skipping.` e continuam o startup normalmente.

**Resultado**: Revisão `00189-pv2` deployada com sucesso. Vaga do caso 230 confirmada na resposta da API (`Caso 230-290`, status `Esperando Ativação`).

**Lição aprendida**: Em ambientes com múltiplas instâncias (Cloud Run min_instances > 0), migration runners no startup devem usar locks distribuídos para evitar execução concorrente. O `pg_advisory_lock` é a solução mais simples quando o banco é PostgreSQL.

---

## 2026-04-11 — Investigacao: Cruzamento WordPress x Banco (Vagas AR)

**Objetivo**: Mapear quais vagas publicadas no site jobs.enlite.health (WordPress) existem no banco de dados (`job_postings`) e vice-versa, para preparar futura sincronizacao entre WordPress, Talentum e banco.

**Descobertas**:

1. **Acesso ao WordPress**: REST API (`/wp-json/wp/v2/`) com Application Password. Sem necessidade de SSH/WP-CLI (hospedado no Cloudways, sem acesso direto ao servidor).

2. **Custom post types**: O WordPress tem 3 tipos de vagas — `vagas_ar` (163 publicadas), `vagas_br` (0), `vagas_en` (0). Todas as vagas ativas sao argentinas.

3. **Correlacao WP ↔ Banco**: O `slug` do post no WordPress corresponde ao `case_number` na tabela `job_postings`. Confirmado por amostragem (cases 230, 676, 747, 746, 110, 160).

4. **Resultado do cruzamento**:
   - 163 vagas no WP — todas existem no banco (match perfeito)
   - 0 vagas orfas no WP (sem registro no banco)
   - 39 vagas no banco (nao-closed) sem post no WordPress

5. **Estado atual das integracoes**:
   - Talentum ↔ Banco: bidirecional completo (campos `talentum_project_id`, `talentum_slug`, etc.)
   - WordPress ↔ Banco: **nenhuma integracao** — nao existe campo `wp_post_id` no schema. Apenas um scraper read-only (`JobScraperService.ts`)

**Proximos passos**: Documentado em `docs/features/wordpress-integration.md` o acesso a API do WP para uso futuro em sincronizacao dos 3 sistemas.

---

## 2026-04-11 — Feature: Canal de Aquisicao do Worker (ACQ)

**Objetivo**: Rastrear por qual canal social (Facebook, Instagram, WhatsApp, LinkedIn, Site) o worker chegou a uma vaga, exibindo essa informacao como badge no kanban de encuadres.

**Problema**: Os short links (Short.io) ja geravam UTM params com `utm_source` por canal, mas a `PublicVacancyPage` nunca capturava esse valor. A informacao de canal se perdia quando o worker saia para o WhatsApp do Talentum.

**Solucao implementada**:

1. **Frontend — Captura UTM** (`PublicVacancyPage.tsx`): ao carregar a pagina publica da vaga, captura `utm_source` da URL e salva em `sessionStorage`. Normaliza `portal_jobs` para `site`.

2. **Frontend — Retorno pos-registro** (`RegisterPage.tsx`, `usePostularseAction.ts`): `confirmRegister()` passa URL de retorno via state. Apos registro, worker volta automaticamente a pagina da vaga com o canal preservado no sessionStorage.

3. **Backend — Coluna + endpoint** (`migration 130`, `WorkerApplicationsController.ts`): nova coluna `acquisition_channel VARCHAR(30)` em `worker_job_applications`. Endpoint `POST /api/worker-applications/track-channel` com validacao Zod e logica first-touch wins (canal nao eh sobrescrito se ja existir).

4. **Frontend — Envio no Postularse** (`usePostularseAction.ts`): antes do `window.open(whatsappUrl)`, le o canal do sessionStorage e envia ao backend. Fire-and-forget — falha nao impede a postulacao.

5. **Backend — Retorno no funnel** (`EncuadreFunnelController.ts`): `GET /funnel` agora retorna `acquisitionChannel` por encuadre.

6. **Frontend — Badge no kanban** (`KanbanCard.tsx`): badge colorido por canal com cores distintas (azul/Facebook, rosa/Instagram, verde/WhatsApp, ceu/LinkedIn, cinza/Site).

7. **Refatoracao**: `EncuadreDashboardController.ts` extraido do `EncuadreFunnelController` para manter arquivos abaixo de 400 linhas. Rotas de worker/encuadre extraidas de `index.ts` para `workerEncuadreRoutes.ts`.

**Arquivos criados**: migration 130, WorkerApplicationsController, EncuadreDashboardController, workerApplicationsRoutes, workerEncuadreRoutes, WorkerApplicationsController.test.ts

**Arquivos modificados**: PublicVacancyPage.tsx, usePostularseAction.ts, RegisterPage.tsx, WorkerApiService.ts, KanbanCard.tsx, KanbanBoard.tsx, useEncuadreFunnel.ts, EncuadreFunnelController.ts, TalentumPrescreeningRepository.ts, index.ts, adminVacanciesRoutes.ts, es.json, pt-BR.json, testes unitarios e E2E

**QA**: 1206 testes backend + 2166 testes frontend passando. Lint, type-check e validate:architecture OK.

**Doc**: `docs/features/acquisition-channel.md` | Roadmap: `docs/ROADMAP_ACQUISITION_CHANNEL.md`

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
