# Roadmap — Canal de Aquisicao do Worker

> Rastrear POR ONDE o worker chegou (Facebook, Instagram, WhatsApp, LinkedIn, Site) e exibir essa informacao no kanban e/ou detalhe do worker.

---

## Status Geral

| Step | Escopo | Status |
|------|--------|--------|
| **Step 1** | Frontend: Capturar UTM na PublicVacancyPage e persistir em sessionStorage | DONE |
| **Step 2** | Frontend: Garantir retorno a vaga apos registro/completar cadastro | DONE |
| **Step 3** | Backend: Nova coluna + endpoint para gravar canal de aquisicao | DONE |
| **Step 4** | Frontend: Enviar canal ao backend no momento do "Postularse" | DONE |
| **Step 5** | Backend: Retornar canal no GET /funnel do kanban | DONE |
| **Step 6** | Frontend: Exibir tag de canal no KanbanCard | DONE |
| **Step 7** | QA: Testes E2E + unitarios + validacao visual | DONE |

---

## Contexto

### Sistema atual de short links

O backend gera short links via Short.io para 5 canais (`VacancySocialLinksController.ts`):
- `facebook`, `instagram`, `whatsapp`, `linkedin`, `site`

Cada link redireciona para a pagina publica da vaga com UTM params:
```
https://go.enlite.health/abc
  -> https://app.enlite.health/vacantes/caso{X}-{Y}
       ?utm_source=facebook
       &utm_medium=vacante
       &utm_campaign={case_number}
       &utm_id=recrutamiento
```

### Problema

O `utm_source` chega na URL da `PublicVacancyPage`, mas **ninguem captura**. A informacao de canal se perde. Hoje nao ha como saber se um worker no kanban veio pelo Facebook, Instagram, etc.

### Fluxo do "Postularse" (ponto-chave)

```
PublicVacancyPage (?utm_source=facebook)
    |
    v
Worker clica "Postularse"
    |
    +-- Nao autenticado? -> Modal -> /register -> registra -> VOLTA a vaga
    |
    +-- Cadastro incompleto? -> Modal -> completa -> VOLTA e clica de novo
    |
    +-- Tudo OK? -> Worker AUTENTICADO + COMPLETO
         -> Neste ponto sabemos QUEM e e POR ONDE veio
         -> window.open(whatsappUrl)
```

O worker SO eh redirecionado ao WhatsApp do Talentum quando ja tem cadastro completo na base. Portanto, no momento do clique final, temos identidade + canal disponiveis.

---

## Detalhamento por Step

### Step 1 — Capturar UTM na PublicVacancyPage

**Arquivo**: `enlite-frontend/src/presentation/pages/public/PublicVacancyPage.tsx`

**O que fazer**:
- No `useEffect` de carregamento da pagina (linha 234), ler `utm_source` dos query params da URL
- Salvar em `sessionStorage`:
  - `enlite_utm_source`: valor do utm_source (ex: "facebook")
  - `enlite_vacancy_return_url`: URL atual completa para retorno pos-registro

**Por que sessionStorage**:
- Persiste entre navegacoes na mesma aba (sobrevive ao `navigate('/register')`)
- Morre ao fechar a aba (nao polui)
- Nao precisa de autenticacao para gravar

**Criterios de aceite**:
- [ ] Ao acessar `/vacantes/caso1-2?utm_source=facebook`, sessionStorage contem `enlite_utm_source = "facebook"`
- [ ] Sem utm_source na URL, sessionStorage NAO eh gravado (nao sobrescrever valor existente)
- [ ] Valores aceitos: `facebook`, `instagram`, `whatsapp`, `linkedin`, `site` (portal_jobs normalizado para site)

---

### Step 2 — Retorno a vaga apos registro

**Arquivos**:
- `enlite-frontend/src/presentation/hooks/usePostularseAction.ts` (linha 109)
- `enlite-frontend/src/presentation/pages/RegisterPage.tsx`

**O que fazer**:
- `confirmRegister()` deve passar a URL de retorno: `navigate('/register', { state: { returnUrl } })` ou via query param
- `RegisterPage` apos registro bem-sucedido deve verificar se ha returnUrl e redirecionar de volta
- O mesmo para o fluxo de cadastro incompleto (se redirecionar para outra pagina)

**Criterios de aceite**:
- [ ] Worker nao autenticado na vaga -> registra -> volta automaticamente a mesma pagina da vaga
- [ ] UTM preservado no sessionStorage durante todo o fluxo
- [ ] Worker com cadastro incompleto -> completa -> volta a vaga

---

### Step 3 — Backend: coluna + endpoint

**Arquivos**:
- Nova migration: `worker-functions/migrations/XXX_add_acquisition_channel.sql`
- `worker-functions/src/interfaces/controllers/` (novo ou existente)
- `worker-functions/src/interfaces/routes/` (rota publica ou autenticada)

**Migration**:
```sql
ALTER TABLE worker_job_applications
  ADD COLUMN IF NOT EXISTS acquisition_channel VARCHAR(30);

COMMENT ON COLUMN worker_job_applications.acquisition_channel
  IS 'Canal social por onde o worker chegou a vaga (facebook, instagram, whatsapp, linkedin, site)';
```

**Decisao de design**: coluna separada de `source` porque:
- `source` = sistema de origem (manual, talent_search, talentum) — conceito tecnico
- `acquisition_channel` = canal social de captacao (facebook, instagram) — conceito de marketing/recrutamento

**Endpoint**: `POST /api/worker-applications/track-channel`
- Auth: requer autenticacao do worker (Firebase token)
- Body: `{ jobPostingId: string, channel: string }`
- Logica:
  1. Validar channel contra lista permitida
  2. Upsert em `worker_job_applications` (workerId do token + jobPostingId)
  3. Se ja existe WJA com `acquisition_channel` preenchido, NAO sobrescrever (first-touch wins)
  4. Se WJA nao existe, criar com `source = 'manual'` e `acquisition_channel = channel`

**Criterios de aceite**:
- [ ] Coluna `acquisition_channel` criada na tabela `worker_job_applications`
- [ ] Endpoint valida channel contra whitelist
- [ ] First-touch: canal nao eh sobrescrito se ja existir
- [ ] Webhook Talentum (upsert em TalentumPrescreeningRepository) NAO sobrescreve acquisition_channel
- [ ] Se WJA nao existe, cria com source='manual' e acquisition_channel preenchido

---

### Step 4 — Frontend: enviar canal no Postularse

**Arquivo**: `enlite-frontend/src/presentation/hooks/usePostularseAction.ts`

**O que fazer** (antes do `window.open` na linha 95):
```typescript
// Ler canal do sessionStorage
const channel = sessionStorage.getItem('enlite_utm_source');
if (channel) {
  await WorkerApiService.trackAcquisitionChannel(jobPostingId, channel);
  sessionStorage.removeItem('enlite_utm_source');
}
window.open(whatsappUrl, '_blank');
```

**Observacoes**:
- O `jobPostingId` precisa ser passado ao hook (hoje so recebe `whatsappUrl`)
- Chamada eh fire-and-forget — se falhar, nao impede o postularse
- Limpar sessionStorage apos envio para nao reenviar

**Criterios de aceite**:
- [ ] Canal enviado ao backend ANTES de abrir WhatsApp
- [ ] Se nao ha canal no sessionStorage, nao faz chamada (nao bloqueia)
- [ ] sessionStorage limpo apos envio bem-sucedido
- [ ] Falha no POST nao impede abertura do WhatsApp

---

### Step 5 — Backend: retornar canal no GET /funnel

**Arquivo**: `worker-functions/src/interfaces/controllers/EncuadreFunnelController.ts`

**O que fazer**:
- Na query do `getFunnel` (linha 32-61), adicionar `wja.acquisition_channel` ao SELECT
- Retornar no objeto de cada encuadre: `acquisitionChannel: row.acquisition_channel`

**Criterios de aceite**:
- [ ] GET /api/admin/vacancies/:id/funnel retorna `acquisitionChannel` em cada encuadre
- [ ] Valor eh `null` quando nao ha canal registrado

---

### Step 6 — Frontend: tag no KanbanCard

**Arquivo**: `enlite-frontend/src/presentation/components/features/admin/Kanban/KanbanCard.tsx`

**O que fazer**:
- Adicionar `acquisitionChannel` ao tipo `FunnelEncuadre`
- Renderizar badge com icone/cor por canal:

| Canal | Cor | Label |
|-------|-----|-------|
| facebook | bg-blue-100 text-blue-700 | Facebook |
| instagram | bg-pink-100 text-pink-700 | Instagram |
| whatsapp | bg-green-100 text-green-700 | WhatsApp |
| linkedin | bg-sky-100 text-sky-700 | LinkedIn |
| site | bg-gray-100 text-gray-600 | Portal |

- Posicionar proximo ao badge de ocupacao (area de tags do card)

**Criterios de aceite**:
- [ ] Badge aparece no card do kanban quando ha canal
- [ ] Sem canal, nenhum badge adicional aparece
- [ ] Cores distintas por canal para leitura rapida
- [ ] Labels em espanhol (i18n)

---

### Step 7 — QA

**Criterios de aceite globais**:
- [ ] Testes unitarios para logica de captura UTM (frontend)
- [ ] Testes unitarios para endpoint track-channel (backend)
- [ ] Teste E2E: fluxo completo (vaga com UTM -> registro -> postularse -> tag no kanban)
- [ ] Screenshot assertion do kanban com tags de canal
- [ ] Lint + type-check passando em ambos os projetos
- [ ] Migration aplicada sem erro em banco limpo e em banco com dados existentes

---

## Decisoes Arquiteturais

| Decisao | Escolha | Justificativa |
|---------|---------|---------------|
| Onde guardar UTM no browser | sessionStorage | Persiste entre navegacoes, morre ao fechar aba |
| Coluna no banco | `acquisition_channel` em `worker_job_applications` | Separar canal social de source tecnico; canal eh por vaga, nao por worker |
| Momento de gravar | No clique de "Postularse" (pre-WhatsApp) | Ultimo momento com worker autenticado + canal disponivel |
| Sobrescrita | First-touch wins | Primeiro canal registrado eh o real; cliques posteriores nao sobrescrevem |
| Falha no POST | Nao-bloqueante | Postularse nao pode falhar por causa de tracking |

---

## Riscos e Mitigacoes

| Risco | Mitigacao |
|-------|-----------|
| Worker abre vaga sem UTM (link direto) | `acquisition_channel` fica null — sem problema |
| Worker abre por um canal, fecha, abre por outro | sessionStorage por aba — cada aba eh independente |
| Webhook Talentum sobrescreve canal | Logica de upsert preserva `acquisition_channel` existente |
| Worker se postula em multiplas vagas pela mesma aba | sessionStorage eh limpo apos primeiro POST — vagas seguintes ficam sem canal (aceito) |
| Short.io muda formato de redirect | UTM eh gerado por nos no `VacancySocialLinksController` — nao depende do Short.io |
