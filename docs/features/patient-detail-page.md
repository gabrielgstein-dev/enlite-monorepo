# PatientDetailPage — visualização "amostragem" (read-only)

## O que é

Página de detalhe do paciente em modo leitura, agrupando todas as informações
clínicas, operacionais e administrativas em uma rota única `/admin/patients/:id`.
Substituiu o "buraco" que existia entre a [listagem `/admin/patients`](../../enlite-frontend/src/presentation/pages/admin/AdminPatientsPage.tsx)
e os modais de edição (que ficaram para Fase 2).

## Por que existe

Antes desta feature, clicar numa linha da tabela de pacientes não levava a
lugar nenhum (`onRowClick` existia mas não estava ligado). Toda informação do
paciente estava acessível só via `VacancyPatientCard` (resumo embutido na tela
da vaga) ou consulta direta ao banco. Recrutadores e operação clínica
precisavam de uma tela "ficha do paciente" — análoga ao `WorkerDetailPage` —
para conferência e referência rápida sem depender de estar dentro do contexto
de uma vaga.

A demanda veio do design (Figma frame `2483:17521`, App EnLite Pro Copy),
que já tinha 18 telas relacionadas a paciente desenhadas em duas categorias:
**amostragem** (read-only) e **edição**. A Fase 1 implementa apenas
amostragem; edição entra em Fase 2 quando o time decidir abrir o fluxo.

## Como funciona

### Rota e navegação

```
/admin/patients         → AdminPatientsPage (listagem, já existia)
   ├ click numa linha   → useNavigate → /admin/patients/:id
/admin/patients/:id     → PatientDetailPage (esta feature)
```

A `AdminPatientsPage` agora passa `onRowClick` para `PatientsTable` —
callback que já existia mas não era propagado.

### Estrutura da página

```
┌────────────────────────────────────────────────────────────────┐
│ Sidebar │ ← Voltar à lista  Cadastro do Paciente   🇦🇷 Argentina │
│         ├──────────────────────────────────────────────────────┤
│         │ ┌──────────────────┐ ┌──────────────────┐            │
│         │ │ PatientIdentity  │ │ PatientGeneral   │            │
│         │ │ Card             │ │ InfoCard         │            │ ← FIXO
│         │ │ (foto + nome +   │ │ (nasc + idade +  │            │   sempre visível
│         │ │  status + emerg) │ │  sexo + idiomas) │            │
│         │ └──────────────────┘ └──────────────────┘            │
│         │                                                      │
│         │ Tabs: ● Dados Clínicos ○ Rede de Apoio ○ Serviço      │
│         │       ○ Dados Financ. ○ Enquadre ○ Agendam ○ Hist.    │
│         │                                                      │
│         │ ┌──── Conteúdo da tab ativa ────┐                    │
│         │ │                                │                    │
│         │ │  N cards read-only (varia por  │                    │
│         │ │  tab — ver mapeamento abaixo)  │                    │
│         │ │                                │                    │
│         │ └────────────────────────────────┘                    │
└────────────────────────────────────────────────────────────────┘
```

### Cards por tab

| Tab | Cards renderizados | Frame Figma |
|-----|--------------------|-------------|
| **Dados Clínicos** (default) | DiagnosticoCard + ProjetoTerapeuticoCard + EquipeTratanteCard + SupervisaoCard + RelatoriosAtendimentosCard | `6390:13184` |
| Rede de Apoio | FamiliaresCard | `5808:13866` |
| Serviço Contratado | CoberturaMedicaCard + LocalizacoesCard + ServicosContratadosCard | `5764:49894` |
| Dados Financeiros | _placeholder "Em breve"_ | _sem frame_ |
| Enquadre | ServicosContratadosCard + EnquadreTerapeuticoCard (kanban placeholder) | `6429:12461` |
| Agendamentos | _placeholder "Em breve"_ | _sem frame_ |
| Histórico | _placeholder "Em breve"_ | _sem frame_ |

Botões "Editar" e "Novo +" renderizam visualmente (preservar fidelidade ao
Figma) mas estão **disabled** até a Fase 2.

### Fluxo de dados

```
PatientDetailPage (page component)
    │
    ├─ useParams() → id da URL
    ├─ usePatientDetail(id) ──────► AdminApiService.getPatientById(id)
    │                                       │
    │                                       ▼
    │                       fetch GET /api/admin/patients/:id
    │                                       │
    │                                       ▼ Authorization: Bearer <Firebase ID Token>
    │                       worker-functions/AdminPatientsController
    │                       └─ GetPatientByIdUseCase
    │                          └─ PatientQueryRepository.findDetailById
    │                             └─ JOIN patients + patient_responsibles
    │                                + patient_addresses + treating_professionals
    │                                       │
    │                                       ▼
    │                       { success: true, data: PatientDetailRow }
    │                                       │
    └─ patient ─────────────────────────────┘
       │
       ├─ <PatientIdentityCard patient={patient} />
       ├─ <PatientGeneralInfoCard patient={patient} />
       └─ Tab content (5 cards diferentes conforme activeTab)
```

### Schema gaps tratados como TODO

Vários campos que aparecem no Figma **não existem** no schema atual de
`patients` — não foram inventados (memória de produto: schema só muda com
parecer do Architect). Renderizam `—`:

- `genderIdentity`, `sexualOrientation`, `racialOrigin`, `religion`, `languages`
- `ageRange` / `faixa etária` (deriva-se de `birthDate` no client)
- "Detalhes do Enquadre", "Capacidade", "Prazo de pagamento" no kanban
- Tabela de versões do Projeto Terapêutico
- "Números de Emergência" da cobertura
- Colunas Quant/Local/Sexo/Valor/Versão do card Serviços Contratados
- Tabela de Supervisão e Relatórios de Atendimentos (sem coluna `supervisions`
  ou `attendance_reports` no schema)

Quando existirem migrations futuras, basta plugar os campos no
`PatientDetailRow` do backend e nos cards do frontend — UI já está pronta.

## Onde no código

### Backend (`worker-functions/`)

| Arquivo | Papel |
|---------|-------|
| `src/modules/case/interfaces/routes/adminPatientsRoutes.ts` | Rota `GET /patients/:id` (após `/stats` para evitar param capture) |
| `src/modules/case/interfaces/controllers/AdminPatientsController.ts` | Método `getPatientById(req, res)` — orquestra Zod + use case + 404/400/500 |
| `src/modules/case/interfaces/validators/adminPatientParamsSchema.ts` | Zod schema validando `id` como UUID v4 |
| `src/modules/case/application/GetPatientByIdUseCase.ts` | Use case puro: chama repo, retorna `{ found, patient? }` |
| `src/modules/case/infrastructure/PatientQueryRepository.ts` | `findDetailById(id)` — entry point + tipos `PatientDetailRow` etc. |
| `src/modules/case/infrastructure/PatientDetailQueryHelper.ts` | Helper que faz os JOINs com responsibles/addresses/professionals |

Testes: 13 (5 use case + 8 controller) em
`worker-functions/src/modules/case/{application,interfaces}/__tests__/`.

### Frontend (`enlite-frontend/`)

| Arquivo | Papel |
|---------|-------|
| `src/domain/entities/PatientDetail.ts` | Tipos `PatientDetail`, `PatientResponsibleDetail`, `PatientAddressDetail`, `PatientProfessionalDetail` (espelho do backend) |
| `src/infrastructure/http/AdminPatientsApiService.ts` | Método `getPatientById(id)` — fetch + auth header |
| `src/infrastructure/http/AdminApiService.ts` | Delegação `getPatientById(id)` |
| `src/hooks/admin/usePatientDetail.ts` | Hook `{ patient, isLoading, error, refetch }` |
| `src/presentation/App.tsx` | Rota `<Route path="patients/:id" element={<PatientDetailPage />} />` |
| `src/presentation/pages/admin/AdminPatientsPage.tsx` | `onRowClick` → `navigate(/admin/patients/:id)` |
| `src/presentation/pages/admin/PatientDetailPage.tsx` | Page principal — carrega, dispatcha por tab |
| `src/presentation/components/features/admin/PatientDetail/` | 12 componentes (8 cards + 1 tabs + 1 fixture + 2 utilitários) |

i18n: chaves em `src/infrastructure/i18n/locales/{es,pt-BR}.json` sob
`admin.patients.detail.*` (es-AR como primary, pt-BR usado em testes visuais
que comparam contra Figma português).

Testes:
- **Unit**: 82 tests em `PatientDetail/__tests__/PatientDetailCards.test.tsx`
- **E2E happy** (`e2e/admin-patient-detail-happy.e2e.ts`): navegação lista→detalhe, tab default, click em cada tab implementada, click em tab placeholder, screenshot baseline
- **E2E 404** (`e2e/admin-patient-detail-not-found.e2e.ts`): backend retorna 404, mensagem de erro, botão "Voltar à lista"
- **E2E visual** (`e2e/admin-patient-detail-visual.e2e.ts`): Playwright baseline + Figma diff side-by-side para cada uma das 4 tabs implementadas
- **E2E integração docker** (`e2e/admin-patient-detail-integration.e2e.ts`): seeda paciente real no Postgres docker, hit no API real (com mock token swap pra contornar `USE_MOCK_AUTH=true`)

## Restrições

- **Schema novo proibido nesta fase.** Campos sem coluna no banco são `—`.
- **Edição proibida.** Botões `Editar`/`Novo+` renderizam visualmente mas
  são `disabled` ou no-op. Phase 2 plugará handlers e modais de edição.
- **400 linhas/arquivo.** Maior componente novo: `PatientIdentityCard` com 142.
- **i18n obrigatório.** Nenhum texto hardcoded.

## Restrições de teste visual

A comparação contra Figma usa o helper `expectMatchesFigma` (ver
[improves/004](../improves/004_visual_diff_helper.md)). Threshold atual: 0.15
(15% de pixels podem divergir). A divergência principal vem das fontes
Poppins/Lexend não estarem pré-carregadas no browser de teste — o fallback
system-default introduz ~12% de diferença visual. Para descer para 0.05
seria preciso carregar as fontes via `@font-face` antes do teste.

## Roadmap futuro

Phase 2 (telas de edição) está mapeada em
[ROADMAP_PATIENT_ENQUADRE_SCREENS.md](../ROADMAP_PATIENT_ENQUADRE_SCREENS.md).
São 11 telas de edição (uma por card) que abrem como modais ao clicar nos
botões "Editar" hoje desabilitados. Cada uma exige:

1. Endpoint `PUT /api/admin/patients/:id/{secao}` no backend
2. Modal/página de form no frontend
3. Validação Zod
4. Migrations onde campos faltam
5. E2E happy + alt + integração

Não há ETA — o time decide quando abrir.

## Referências

- Figma: `App EnLite Pro (Copy)` fileKey `6weibfyKiLH2VWWcxcIRiA`, frames listados em [ROADMAP_PATIENT_ENQUADRE_SCREENS.md](../ROADMAP_PATIENT_ENQUADRE_SCREENS.md)
- Backend pattern model: `GET /api/admin/workers/:id` (`AdminWorkersController.getWorkerById`)
- Frontend pattern model: `WorkerDetailPage.tsx` + `WorkerDetail/` components
- Helper de teste visual: [improves/004_visual_diff_helper.md](../improves/004_visual_diff_helper.md)
