# Roadmap: Telas de Paciente e Enquadre

> Status: **Em execução — Fase 1 (Amostragem)**
> Criado em: 2026-04-25
> Atualizado em: 2026-04-25

---

## Fonte de Design

- **Figma file:** `App EnLite Pro (Copy)` — `fileKey=6weibfyKiLH2VWWcxcIRiA`
- **Frame raiz:** `2483:17521` ([abrir no Figma](https://www.figma.com/design/6weibfyKiLH2VWWcxcIRiA/App-EnLite-Pro--Copy-?node-id=2483-17521&m=dev))
- O frame raiz contém as telas read-only do **PatientDetailPage** ("Cadastro do Paciente" no Figma significa "ficha do paciente", não "formulário de cadastro") e os modais de edição (`edit. X`) que abrem ao clicar nos botões "Editar".

Como abrir uma tela específica via MCP Figma:

```
mcp__figma__get_design_context(fileKey="6weibfyKiLH2VWWcxcIRiA", nodeId="<id>")
mcp__figma__get_screenshot(fileKey="6weibfyKiLH2VWWcxcIRiA", nodeId="<id>")
```

---

## Fase 1 — Telas de Amostragem (read-only) — EM EXECUÇÃO

Decisão do PO: **só implementar visualização agora**. Botões "Editar" e "Novo +" renderizam pra fechar com Figma mas ficam **no-op** (sem handler) — quando edição for liberada, é só plugar.

### Estrutura da PatientDetailPage

```
┌──────────────────────────────────────────────────────────────┐
│ Sidebar │ Header: "Cadastro do Paciente"   🇦🇷 Argentina    │
│         ├──────────────────────────────────────────────────┤
│         │ ┌──────────────────┐ ┌──────────────────┐        │
│         │ │ Identidade       │ │ Informações      │        │ ← FIXO
│         │ │ + Status         │ │ Gerais           │        │
│         │ │ + Contato Emerg. │ │ (read-only)      │        │
│         │ └──────────────────┘ └──────────────────┘        │
│         │                                                  │
│         │ [Dados Clínicos] Rede de Apoio  Serviço Contratado│
│         │  Dados Financeiros  Enquadre  Agendamentos  Histórico│
│         │                                                  │
│         │   ┌────── conteúdo da tab ativa ──────┐          │
│         │   │ Cards read-only conforme tab       │          │
│         │   └────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────────┘
```

### Mapeamento de telas read-only por tab (V2 priority)

| Tab | Frame Figma (V2) | Cards renderizados |
|-----|------------------|--------------------|
| **Dados Clínicos** ✅ default | `6390:13184` (1440×2377) | Diagnóstico + Projeto Terapêutico |
| **Rede de Apoio** | `5808:13866` (1440×1024) | Familiares + (?) Equipe Tratante |
| **Serviço Contratado** | `5764:49894` (1440×1861) | Cobertura Médica + Obra Social + Serviço Contratado |
| **Dados Financeiros** | _sem frame_ | Placeholder "Em breve" |
| **Enquadre** | `6429:12461` (1440×2035) | Enquadre Terapêutico (Casa/Escola) |
| **Agendamentos** | _sem frame_ | Placeholder "Em breve" |
| **Histórico** | `6429:12461` (incluído) | Timeline (mesma tela do Enquadre) |

> Frames V1 descartados: `3281:20774`, `5757:51931` (substituídos por V2).

### Cards no header (sempre visíveis em todas as tabs)

| Card | Origem dos dados (DB) |
|------|----------------------|
| **Identidade + Status + Contato Emergência** | `patients` (first_name, last_name, document_*, phone_whatsapp, address_*) + `patient_responsibles` (1 titular) |
| **Informações Gerais** | `patients` (birth_date, sex). Faixa etária / gênero / orientação / origem racial / idiomas: TODO — colunas não existem hoje, retornam null |

---

## Fase 2 — Telas de Edição (`edit. X`) — BACKLOG

Implementação só após Fase 1 estar em produção. Cada modal/página de edição é uma tarefa independente.

| # | Tela | Frame Figma (V2) |
|---|------|------------------|
| 2.1 | Edit informações gerais | `6017:11852` |
| 2.3 | Edit diagnóstico | `8063:57578` |
| 2.4 | Edit obra social | `5767:50833` |
| 2.5 | Edit infos familiar | `5813:39758` |
| 2.6 | Edit localizações / endereço | `6453:55404` |
| 2.8 | Edit projeto terapêutico | `6018:19083` |
| 3.1 | Edit equipe tratante | `3815:6839` |
| 3.2 | Edit supervisão | `3363:21595` |
| 3.3 | Cadastro de serviço | `5764:49894` |
| 3.5 | Cadastro de itinerário | `6429:12461` |
| 4.2 | Edit enquadre rejeitado | `8855:18636` |

---

## Lacunas Conhecidas

- **Tab Dados Financeiros**: sem frame Figma — placeholder "Em breve" na implementação atual.
- **Tab Agendamentos**: sem frame Figma — placeholder "Em breve".
- **Listagem de pacientes**: já existe (`AdminPatientsPage` em `enlite-frontend/src/presentation/pages/admin/AdminPatientsPage.tsx`), só falta o `onRowClick` levar pro detalhe.
- **Fluxo de enquadre completo**: só "rejeitado" tem frame; estados *em análise*, *aprovado*, *aguardando AT* serão desenhados depois.
- **Exclusão / desligamento de paciente**: sem frame, fora de escopo.

---

## Constraints de Implementação

- **Schema novo é proibido** nesta fase. Se um campo do Figma não existir no banco, retorna null + TODO no comentário.
- **Botões de edição renderizam mas são no-op** — sem onClick, sem modal aberto.
- **Cada tab = 1 commit** com: unit (100% cobertura) + visual side-by-side com Figma + E2E feliz + E2E alternativo + E2E integração docker. Push só no final.
- **Visual side-by-side** automatizado via helper `compareWithFigma(page, nodeId)` que compara screenshot Playwright contra PNG cacheado do Figma (threshold 0.025 full-page, 0.015 componente).

---

## Plano de Execução (Fase 1)

```
[em curso] Backend: GET /api/admin/patients/:id (use case + repo + controller + rota)
[em curso] Frontend: visual diff helper (compareWithFigma)
[próximo]  Frontend: type Patient + AdminApiService.getPatientById + usePatientDetail
[próximo]  Frontend: PatientDetailPage shell + rota /admin/patients/:id + onRowClick na lista
[próximo]  Frontend: cards do header (Identidade + Informações Gerais)
[próximo]  Frontend: cards Dados Clínicos (Diagnóstico + Projeto Terapêutico)
[próximo]  Tests + lint + type-check
[próximo]  Commit 1
[próximo]  Repetir pra Rede de Apoio, Serviço Contratado, Enquadre+Histórico
[fim]      Push de todos os commits
```

---

## Critério de Aceite (Fase 1)

- [ ] `/admin/patients/:id` carrega o paciente real do backend
- [ ] Click numa linha da listagem navega pro detalhe
- [ ] Header mostra: foto, nome, status, contato, contato emergência, datas, info gerais
- [ ] Tabs renderizam (4 implementadas + 2 placeholder + 1 com Histórico no mesmo frame)
- [ ] Botões "Editar" e "Novo +" renderizam visualmente mas não fazem nada
- [ ] Visual diff contra Figma passa com threshold 0.025
- [ ] Unit tests cobrem 100% dos componentes novos
- [ ] E2E feliz e alternativo passam local + docker
- [ ] Lint + type-check sem warnings novos
