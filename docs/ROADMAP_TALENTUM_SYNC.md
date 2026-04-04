# Roadmap — Sync Talentum Projects → Parse LLM → Update Vacantes

> Busca automaticamente todos os projects publicados na Talentum, extrai campos estruturados da descricao via Gemini e atualiza/cria as vacantes correspondentes no banco Enlite.

---

## Status Geral

| Step | Escopo | Status |
|------|--------|--------|
| **Step 1** | Backend: Estender `TalentumApiClient` com paginacao | DONE |
| **Step 2** | Backend: Service de parsing de descricao Talentum via Gemini | DONE |
| **Step 3** | Backend: `SyncTalentumVacanciesUseCase` | DONE |
| **Step 4** | Backend: Endpoint admin + rota | DONE |
| **Step 5** | Frontend: Botao "Sincronizar con Talentum" na listagem de vacantes | DONE |
| **Step 6** | QA: Teste E2E | PENDENTE |

---

## Contexto

### Fluxo manual atual
```
1. Recrutadora cria job_posting na Talentum manualmente (titulo CASO X + descricao rica)
2. Recrutadora copia dados relevantes para o banco Enlite manualmente
3. Dados ficam desatualizados ou incompletos no Enlite
```

### Fluxo automatizado (este roadmap)
```
1. Admin dispara POST /api/admin/vacancies/sync-talentum
2. Backend busca TODOS os projects da Talentum (paginacao automatica)
3. Para cada project:
   a. Extrai case_number do titulo (regex CASO (\d+))
   b. Faz lookup em job_postings por case_number
   c. Se existe: chama Gemini para parsear description → update campos nao-nulos
   d. Se nao existe: cria nova vacante com campos parseados
4. Retorna relatorio: synced, criadas, erros, ignoradas
```

### Exemplo de description Talentum (input para o LLM)
```
Descripcion de la Propuesta:
Se busca un profesional para una prestacion de servicios destinada a un paciente
adulto de 29 anos con diagnostico de bipolaridad en la zona de Recoleta, CABA.
El objetivo principal es brindar acompanamiento terapeutico domiciliario para
favorecer su estabilidad y autonomia. Los turnos disponibles son de lunes a
viernes, de 17:00 a 23:00.

Perfil Profesional Sugerido:
Buscamos un Acompanante Terapeutico de sexo masculino (excluyente) que cuente
con formacion solida y experiencia acreditable en el trabajo con adultos que
presentan trastornos del espectro bipolar.

El Marco de Acompanamiento:
EnLite Health Solutions ofrece a los prestadores un marco de trabajo profesional...
```

### Output esperado do LLM (JSON estruturado)
```json
{
  "case_number": 42,
  "title": "CASO 42",
  "required_professions": ["AT"],
  "required_sex": "M",
  "age_range_min": null,
  "age_range_max": null,
  "required_experience": "formacion solida y experiencia acreditable con trastornos del espectro bipolar",
  "worker_attributes": null,
  "schedule": [
    { "dayOfWeek": 1, "startTime": "17:00", "endTime": "23:00" },
    { "dayOfWeek": 2, "startTime": "17:00", "endTime": "23:00" },
    { "dayOfWeek": 3, "startTime": "17:00", "endTime": "23:00" },
    { "dayOfWeek": 4, "startTime": "17:00", "endTime": "23:00" },
    { "dayOfWeek": 5, "startTime": "17:00", "endTime": "23:00" }
  ],
  "work_schedule": "part-time",
  "pathology_types": "Bipolaridad",
  "dependency_level": null,
  "service_device_types": ["DOMICILIARIO"],
  "providers_needed": 1,
  "salary_text": "A convenir",
  "payment_day": null,
  "daily_obs": null,
  "city": "Recoleta",
  "state": "CABA",
  "status": "BUSQUEDA"
}
```

---

## Step 1 — Estender `TalentumApiClient` com paginacao

**Status:** DONE

### Objetivo
O metodo `listPrescreenings()` atual nao suporta paginacao nem o filtro `onlyOwnedByUser`. Precisamos iterar todas as paginas ate nao retornar mais projects.

### Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/domain/interfaces/ITalentumApiClient.ts` | Adicionar params opcionais `page`, `onlyOwnedByUser` em `listPrescreenings()` + novo metodo `listAllPrescreenings()` |
| `src/infrastructure/services/TalentumApiClient.ts` | Implementar query params e loop de paginacao |

### API Talentum — paginacao
```
GET /pre-screening/projects?page=1&onlyOwnedByUser=false

Response: { projects: TalentumProject[], count: number }
```
- `page` comeca em 1
- `count` retorna o total de projects (nao da pagina)
- Iterar incrementando `page` ate `projects.length === 0`

### Interface atualizada
```typescript
listPrescreenings(opts?: {
  page?: number;
  onlyOwnedByUser?: boolean;
}): Promise<{ projects: TalentumProject[]; count: number }>;

listAllPrescreenings(): Promise<TalentumProject[]>;
```

### Criterios de aceite
- [x] `listPrescreenings({ page: 2 })` envia `?page=2` na query
- [x] `listAllPrescreenings()` retorna todos os projects de todas as paginas
- [x] Loop para quando uma pagina retorna `projects: []`

---

## Step 2 — Service de parsing de descricao Talentum via Gemini

**Status:** DONE

### Objetivo
Parsear a `description` de um `TalentumProject` em campos estruturados de vacancy. Reutilizar a infraestrutura do `GeminiVacancyParserService` (mesma API key, mesmo modelo).

### Decisao arquitetural
Criar metodo novo no `GeminiVacancyParserService` em vez de service separado. A logica e a mesma (texto livre → JSON), so muda o prompt e o output (so vacancy fields, sem prescreening/faq).

### Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/infrastructure/services/GeminiVacancyParserService.ts` | Novo metodo `parseFromTalentumDescription(description: string)` |

### Novo metodo
```typescript
async parseFromTalentumDescription(
  description: string,
  title: string,
): Promise<ParsedVacancyResult['vacancy']>
```

### Prompt especifico
- Input: description completa do Talentum (Descripcion de la Propuesta + Perfil Profesional + Marco)
- Extrair: tipo de profissional (AT vs CUIDADOR inferido do texto), sexo, idade, zona, patologia, horarios, dispositivo
- Usar os mesmos codigos de normalizacao (M/F/BOTH, AT/CAREGIVER, DOMICILIARIO/ESCOLAR etc.)
- O `case_number` vem do `title`, nao do LLM

### Criterios de aceite
- [x] Dado uma description tipica da Talentum, retorna JSON com campos corretos
- [x] Infere worker type (AT vs CUIDADOR) a partir do texto
- [x] Nao inclui prescreening/faq no output (ja existem na Talentum)
- [x] Campos nao inferidos retornam `null` (nunca inventa)

---

## Step 3 — `SyncTalentumVacanciesUseCase`

**Status:** DONE

### Objetivo
Orquestrar o sync completo: buscar projects → parsear → criar ou atualizar vacantes.

### Arquivos criados/modificados

| Arquivo | Tipo |
|---------|------|
| `src/application/use-cases/SyncTalentumVacanciesUseCase.ts` | CRIADO |

### Decisao arquitetural
Nao foi necessario criar um `JobPostingRepository` separado. O use case faz queries diretas via `Pool` (mesmo padrao do `PublishVacancyToTalentumUseCase`), com metodos privados `updateFromSync()`, `createFromSync()` e `saveTalentumReference()`. O `findByCaseNumber` ja existia em `JobPostingARRepository` mas foi replicado inline por simplicidade (query de 1 linha).

### Fluxo implementado
1. `TalentumApiClient.listAllPrescreenings()` busca todas as paginas
2. Para cada project, `processProject()` (metodo isolado com try/catch individual):
   a. Regex `CASO\s+(\d+)` extrai case_number do titulo → skip se nao match
   b. `SELECT id FROM job_postings WHERE case_number = $1` → lookup
   c. `GeminiVacancyParserService.parseFromTalentumDescription()` → parsing LLM
   d. Se existe: `updateFromSync()` (dynamic SET com apenas campos nao-nulos)
   e. Se nao existe: `createFromSync()` (INSERT com status=BUSQUEDA, country=AR)
   f. `saveTalentumReference()` salva projectId, publicId, whatsappUrl, slug, timestamp, description

### Regras de update
- `updateFromSync()` constroi SET clause dinamico filtrando `f.value != null`
- Campos JSONB (schedule) recebem `JSON.stringify()` automatico
- Nunca apaga valor existente no DB com null do LLM
- Erros em um project nao param o sync — vao pro array `errors` do relatorio

### Criterios de aceite
- [x] Sync busca todas as paginas da Talentum
- [x] Extrai case_number do titulo via regex
- [x] Atualiza vacante existente sem sobrescrever campos com null
- [x] Cria vacante nova quando case_number nao existe
- [x] Salva referencia Talentum (projectId, whatsappUrl, etc.)
- [x] Erros individuais nao abortam o sync
- [x] Retorna relatorio completo

---

## Step 4 — Endpoint admin + rota

**Status:** DONE

### Objetivo
Expor o sync como endpoint admin protegido por autenticacao.

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/interfaces/controllers/VacancyTalentumController.ts` | Novo metodo `syncFromTalentum()` |
| `src/index.ts` | Rota `POST /api/admin/vacancies/sync-talentum` com `requireStaff()` |

### Decisao arquitetural
Rota adicionada diretamente em `index.ts` (mesmo padrao das demais rotas de vacancy) em vez de em `talentumRoutes.ts` (que e exclusivo para webhooks Talentum com auth Google ID Token). A rota usa `authMiddleware.requireStaff()` — mesma protecao dos demais endpoints admin.

### Endpoint
```
POST /api/admin/vacancies/sync-talentum
Auth: Bearer token (Firebase staff)
Response 200:
{
  "success": true,
  "data": {
    "total": 15,
    "updated": 10,
    "created": 3,
    "skipped": 2,
    "errors": []
  }
}
```

### Tratamento de erros
- Erros com "Talentum" ou "tl_auth" no message → **502** (falha comunicacao Talentum)
- Demais erros (Gemini, DB etc.) → **500**

### Criterios de aceite
- [x] Endpoint protegido por auth admin (`requireStaff()`)
- [x] Retorna 200 com relatorio JSON
- [x] Retorna 502 se falha na comunicacao com Talentum
- [x] Retorna 500 se falha no Gemini

---

## Step 5 — Frontend: Botao "Sincronizar con Talentum" na listagem de vacantes

**Status:** DONE

### Objetivo
Adicionar botao na pagina de listagem de vacantes (`AdminVacanciesPage`) que dispara o sync on-demand e mostra feedback do resultado.

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `enlite-frontend/src/infrastructure/http/AdminApiService.ts` | Novo metodo `syncFromTalentum()` → `POST /api/admin/vacancies/sync-talentum` |
| `enlite-frontend/src/presentation/pages/admin/AdminVacanciesPage.tsx` | Botao "Sincronizar Talentum" + handler + inline feedback |
| `enlite-frontend/src/hooks/admin/useVacanciesData.ts` | `refetch()` corrigido com `fetchKey` state |
| `enlite-frontend/src/infrastructure/i18n/locales/es.json` | Chaves `syncTalentum` e `syncing` |
| `enlite-frontend/src/infrastructure/i18n/locales/pt-BR.json` | Chaves `syncTalentum` e `syncing` |

### Implementacao
- Botao com icone `RefreshCw` ao lado do "Nueva", no header da secao de tabela
- Loading: icone gira (`animate-spin`), texto muda para "Sincronizando...", botao desabilitado
- Feedback inline ao lado do botao: verde (sucesso) ou vermelho (erro), desaparece apos 6s
- Texto resume o relatorio: "X actualizadas, Y creadas, Z ignoradas, N errores"
- Apos sync: `refetch()` recarrega tabela e stats automaticamente

### Criterios de aceite
- [x] Botao visivel na listagem de vacantes, ao lado de "New Vacancy"
- [x] Loading state com spinner durante sync
- [x] Apos sync, tabela atualiza automaticamente (refetch)
- [x] Feedback mostra total atualizado/criado/ignorado
- [x] Erros parciais nao bloqueiam feedback de sucesso
- [x] Botao desabilitado durante sync (evita duplo-click)

---

## Step 6 — Teste E2E

**Status:** PENDENTE

### Objetivo
Validar o fluxo completo com mocks de Talentum API e Gemini API.

### Arquivo a criar

| Arquivo | Tipo |
|---------|------|
| `worker-functions/tests/e2e/talentum-sync.test.ts` | CRIAR |

### Cenarios

1. **Sync com vacante existente** — project na Talentum com CASO X que ja existe no DB → atualiza campos
2. **Sync com vacante nova** — project na Talentum com CASO Y que nao existe → cria vacante
3. **Titulo sem case_number** — project com titulo generico → skip
4. **Erro no Gemini** — falha de parsing nao aborta sync dos demais
5. **Paginacao** — multiplas paginas retornadas pela Talentum

### Criterios de aceite
- [ ] Todos os 5 cenarios passam
- [ ] Mocks de Talentum e Gemini isolam o teste de dependencias externas
- [ ] Verifica que campos nao-nulos foram atualizados no DB
- [ ] Verifica que campos existentes nao foram sobrescritos com null

---

## Decisoes

| # | Pergunta | Decisao |
|---|----------|---------|
| 1 | Se vacancy nao existe no DB, criar automaticamente? | **SIM — criar com status BUSQUEDA** |
| 2 | Worker type (AT vs CUIDADOR): inferir do texto ou default AT? | **Inferir do texto via LLM** |
| 3 | Executar sync como cron ou apenas on-demand? | **On-demand — botao na listagem** |
| 4 | Rate limit no Gemini: throttle entre chamadas? | A DEFINIR (depende do volume) |
