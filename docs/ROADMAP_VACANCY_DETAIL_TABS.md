# Roadmap: Tabs na Tela de Detalhes da Vacante (Admin)

> Status: **Pendente**
> Criado em: 2026-04-05

---

## Objetivo

Reorganizar a tela de detalhes da vacante (`/admin/vacancies/:id`) em abas, seguindo o mesmo padrao visual da tela de detalhes do worker. Isso melhora a navegabilidade, separa responsabilidades e prepara a tela para funcionalidades futuras (links de redes sociais).

---

## Layout Proposto

```
[Header: Breadcrumb "Vacantes > CASO 748 — Nombre" + botoes Enrich/Edit/Kanban/Match]

Row 1: [VacancyStatusCard]        [VacancyPatientCard]        ← FIXO (sempre visivel)
Row 2: [VacancyRequirementsCard]  [VacancyScheduleCard]       ← FIXO (sempre visivel)

[Tabs: Encuadres | Talentum | Links ]

  Encuadres  → VacancyEncuadresCard
  Talentum   → VacancyPrescreeningConfig + VacancyTalentumCard + tabela Publicaciones
  Links      → VacancyMeetLinksCard + (futuro: redes sociais)
```

### Secao Fixa (acima das abas)

Os 4 cards de resumo permanecem **sempre visiveis** independente da aba ativa:

| Card | Conteudo |
|------|----------|
| VacancyStatusCard | status, caso, pais, data inicio, vagas necessarias |
| VacancyPatientCard | nome, diagnostico, nivel de dependencia, zona, plano verificado |
| VacancyRequirementsCard | sexo, profissoes, especialidades, diagnosticos requeridos |
| VacancyScheduleCard | dias, turnos, interpretacao LLM |

### Abas

| Aba | Componentes | Justificativa |
|-----|-------------|---------------|
| **Encuadres** (default) | `VacancyEncuadresCard` | Atividade principal do recrutador — tabela de entrevistas com filtros e paginacao |
| **Talentum** | `VacancyPrescreeningConfig` + `VacancyTalentumCard` + tabela Publicaciones | Agrupa toda a config de publicacao: prescreening, status Talentum e historico de publicacoes |
| **Links** | `VacancyMeetLinksCard` + futuro: links redes sociais | Separa links operacionais (Meet) e prepara para links de redes sociais futuros |

---

## Tasks

### Task 1: Frontend — Componente VacancyDetailTabs

**Status:** [ ] Pendente
**Escopo:** Frontend (enlite-frontend)

**Descricao:** Criar componente de tabs seguindo o padrao existente de `WorkerProfileTabs.tsx`.

**Arquivos:**
- `enlite-frontend/src/presentation/components/features/admin/VacancyDetail/VacancyDetailTabs.tsx` (novo)

**Implementacao:**
```typescript
export type VacancyTab = 'encuadres' | 'talentum' | 'links';

const TABS: VacancyTab[] = ['encuadres', 'talentum', 'links'];

const TAB_I18N_KEYS: Record<VacancyTab, string> = {
  encuadres: 'admin.vacancyDetail.tabs.encuadres',
  talentum: 'admin.vacancyDetail.tabs.talentum',
  links: 'admin.vacancyDetail.tabs.links',
};
```

**Criterios de aceite:**
- [ ] Mesmo padrao visual de `WorkerProfileTabs` (bg-primary ativo, hover, shadow)
- [ ] Usa i18n para labels
- [ ] Props: `activeTab` + `onTabChange`

---

### Task 2: Frontend — Refatorar VacancyDetailPage com tabs

**Status:** [ ] Pendente
**Escopo:** Frontend (enlite-frontend)
**Depende de:** Task 1

**Descricao:** Reorganizar `VacancyDetailPage.tsx` para exibir os 4 cards fixos acima e renderizar conteudo condicional abaixo das tabs.

**Arquivos:**
- `enlite-frontend/src/presentation/pages/admin/VacancyDetailPage.tsx` (editar)

**Mudancas:**
1. Adicionar `useState<VacancyTab>('encuadres')` para controlar aba ativa
2. Manter as 2 rows de cards (Status+Paciente, Requisitos+Horario) como secao fixa
3. Adicionar `<VacancyDetailTabs>` abaixo dos cards fixos
4. Renderizar conteudo condicional baseado na aba ativa:
   - `encuadres` → `VacancyEncuadresCard`
   - `talentum` → `VacancyPrescreeningConfig` + `VacancyTalentumCard` + tabela Publicaciones
   - `links` → `VacancyMeetLinksCard`

**Criterios de aceite:**
- [ ] Cards fixos (Status, Paciente, Requisitos, Horario) sempre visiveis
- [ ] Aba default: Encuadres
- [ ] Troca de aba nao causa re-fetch dos dados
- [ ] Tabela de Publicaciones movida para dentro da aba Talentum
- [ ] Nenhum arquivo > 400 linhas
- [ ] Padrao visual consistente com WorkerDetailPage

---

### Task 3: Frontend — i18n para tabs

**Status:** [ ] Pendente
**Escopo:** Frontend (enlite-frontend)
**Depende de:** Task 1

**Arquivos:**
- `enlite-frontend/src/infrastructure/i18n/locales/es.json`
- `enlite-frontend/src/infrastructure/i18n/locales/pt-BR.json`

**Chaves:**
```json
{
  "admin.vacancyDetail.tabs.encuadres": "Encuadres",
  "admin.vacancyDetail.tabs.talentum": "Talentum",
  "admin.vacancyDetail.tabs.links": "Links"
}
```

**Criterios de aceite:**
- [ ] Chaves em ES e PT-BR
- [ ] Labels consistentes com o dominio

---

### Task 4: Frontend — Testes

**Status:** [ ] Pendente
**Escopo:** Frontend (enlite-frontend)
**Depende de:** Task 2

**Arquivos:**
- `enlite-frontend/src/presentation/components/features/admin/VacancyDetail/__tests__/VacancyDetailTabs.test.tsx` (novo)

**Criterios de aceite:**
- [ ] Testa renderizacao de todas as tabs
- [ ] Testa click troca aba ativa
- [ ] Testa que aba default e Encuadres

---

## Sequencia de Execucao

```
Task 1 (VacancyDetailTabs) ──► Task 2 (Refatorar page)
         │                              │
         ▼                              ▼
Task 3 (i18n)                  Task 4 (Testes)
```

Tasks 3 e 4 podem ser paralelizadas apos suas dependencias.

---

## Riscos

| Risco | Mitigacao |
|-------|-----------|
| VacancyDetailPage ultrapassa 400 linhas | Atual: 259 linhas. Com tabs: ~200 (conteudo condicional reduz linhas renderizadas). Se ultrapassar, extrair secao Talentum para subcomponente |
| Perda de estado ao trocar aba (ex: formulario Meet nao salvo) | Componentes ja salvam via botao explicito. Nao ha estado intermediario em risco |
| Tabela Publicaciones fica escondida na aba Talentum | Aceitavel — publicacoes sao contexto do Talentum, nao consulta frequente |

---

## Preparacao para Futuro

A aba **Links** ja esta preparada para receber:
- Links de redes sociais (Instagram, LinkedIn, etc.) da vacante
- Link do Google Meet (ja existente)
- Outros links operacionais que surgirem

Quando redes sociais forem implementadas, basta adicionar um novo componente dentro da aba Links sem alterar a estrutura de tabs.

---

## Checklist QA Final

- [ ] 4 cards fixos (Status, Paciente, Requisitos, Horario) sempre visiveis
- [ ] 3 abas funcionando: Encuadres, Talentum, Links
- [ ] Aba Encuadres como default
- [ ] Aba Talentum contem: PrescreeningConfig + TalentumCard + Publicaciones
- [ ] Aba Links contem: MeetLinksCard
- [ ] Troca de aba e fluida (sem re-fetch)
- [ ] Padrao visual identico ao WorkerProfileTabs
- [ ] Responsivo (mobile + desktop)
- [ ] Nenhum arquivo > 400 linhas
- [ ] `pnpm type-check` passa
- [ ] `pnpm lint` passa
- [ ] `pnpm validate:architecture` passa
- [ ] i18n ES e PT-BR completos
- [ ] Testes unitarios passam
