# Analytics & Dashboards (ANL)

## O que e

Dashboards de metricas de recrutamento, performance de coordenadores e alertas de casos problematicos. Inclui metricas globais, analise por caso, distribuicao geografica e taxas de conversao por canal de captacao.

## Por que existe

A equipe de gestao precisa de visibilidade sobre:
- Quantas vagas estao abertas e ha quanto tempo
- Quais coordenadores estao sobrecarregados
- Quais casos precisam de intervencao humana
- Qual canal de captacao tem melhor taxa de conversao

## Como funciona

### Dashboard de Recrutamento (3 tabs)

```
Tab Global:
  |  Metricas agregadas: casos ativos, candidatos, publicacoes, encuadres
  |  Grafico de publicacoes por canal
  |  Tabela de casos ativos (clicavel)
  v
Tab Caso:
  |  Busca por numero do caso
  |  Metricas especificas: candidatos, Talentum, convidados, encuadres
  v
Tab Zona:
  |  Distribuicao geografica de casos (em desenvolvimento)
```

### Dashboard de Coordenadores

```
Secao 1: Alertas
  |  Casos com >200 encuadres sem selecao
  |  Casos abertos >30 dias
  |  Casos sem candidatos em 7 dias
  |  Cards vermelhos clicaveis -> kanban
  v
Secao 2: Conversao por Canal
  |  Tabela: Canal, Total, Atendidos, Selecionados, Conversao %
  v
Secao 3: Cards de Coordenadores
  |  Horas semanais, casos ativos, taxa de conversao, encuadres na semana
```

### Metricas de Workers

```
Stats por status: REGISTERED, INCOMPLETE_REGISTER, DISABLED
  |  Documentos faltantes
  |  Engajamento com vagas por worker
  v
Deduplicacao
  |  Detecta duplicatas por telefone/email/nome
  |  LLM para confidence scoring
  |  Merge com dry-run
```

## Endpoints

### Recrutamento

| Metodo | Rota | Funcao |
|--------|------|--------|
| GET | `/api/admin/recruitment/global-metrics` | Metricas globais |
| GET | `/api/admin/recruitment/case/:caseNumber` | Analise por caso |
| GET | `/api/admin/recruitment/zones` | Distribuicao por zona |
| GET | `/api/admin/recruitment/clickup-cases` | Casos ClickUp |
| GET | `/api/admin/recruitment/talentum-workers` | Workers Talentum |
| GET | `/api/admin/recruitment/progreso` | Candidatos em progresso |
| GET | `/api/admin/recruitment/publications` | Publicacoes por canal |
| GET | `/api/admin/recruitment/encuadres` | Encuadres com filtros |
| POST | `/api/admin/recruitment/calculate-reemplazos` | Sel/Rem por caso |

### Coordenadores

| Metodo | Rota | Funcao |
|--------|------|--------|
| GET | `/api/admin/dashboard/coordinator-capacity` | Metricas por coordenador |
| GET | `/api/admin/dashboard/alerts` | Alertas de casos |
| GET | `/api/admin/dashboard/conversion-by-channel` | Conversao por canal |

### Workers Analytics

| Metodo | Rota | Funcao |
|--------|------|--------|
| GET | `/analytics/workers` | Stats por status |
| GET | `/analytics/workers/missing-documents` | Docs faltantes |
| GET | `/analytics/workers/:id/vacancies` | Engajamento do worker |
| GET | `/analytics/dedup/candidates` | Candidatos duplicados |
| POST | `/analytics/dedup/run` | Executar dedup |

## Componentes

### Backend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/interfaces/controllers/RecruitmentController.ts` | Dashboard recrutamento |
| `src/interfaces/controllers/AnalyticsController.ts` | Worker analytics + dedup |
| `src/interfaces/controllers/EncuadreFunnelController.ts` | Coordenadores + alertas |
| `src/infrastructure/services/WorkerDeduplicationService.ts` | Deteccao e merge de duplicatas |
| `src/infrastructure/repositories/AnalyticsRepository.ts` | Queries analiticas |
| `src/infrastructure/repositories/ClickUpCaseRepository.ts` | Dados ClickUp |

### Frontend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/presentation/pages/admin/AdminRecruitmentPage.tsx` | Dashboard recrutamento (3 tabs) |
| `src/presentation/pages/admin/CoordinatorDashboardPage.tsx` | Dashboard coordenadores |
| `src/hooks/recruitment/useDashboardData.ts` | Fetch multi-fonte |
| `src/hooks/recruitment/useGlobalMetrics.ts` | Metricas agregadas |
| `src/hooks/recruitment/useActiveCases.ts` | Lista casos ativos |
| `src/hooks/recruitment/useCaseAnalysis.ts` | Analise por caso |
| `src/hooks/admin/useCoordinatorDashboard.ts` | Metricas coordenadores |

## Regras de negocio

### Alertas (thresholds)
- **>200 encuadres sem SELECCIONADO**: caso com muitas tentativas fracassadas
- **>30 dias aberto**: caso parado demais
- **0 candidatos em 7 dias**: caso sem atividade recente
- Ordenados por severidade

### Metricas de coordenador
- **Taxa de conversao**: SELECCIONADO / encuadres atendidos
- **Horas semanais**: Da tabela coordinator_weekly_schedules
- **Filtro**: Apenas casos nao-cobertos (status != CUBIERTO)

### Reemplazos (color coding)
- **Verde**: >= 10 total E ambos tipos (sel + rem) presentes
- **Amarelo**: Ambos tipos mas < 10 total
- **Vermelho**: Faltando um dos tipos

### Deduplicacao
- Match por similaridade de telefone, email, nome
- LLM para confidence scoring
- Suporte dry-run antes do merge
- Merge cria referencia `merged_into_id`

### Filtros de data
- Presets: 1m, 3m, 6m, YTD, All
- Custom date range
- Aplicado a todas as queries

## Integracoes externas

- **ClickUp API**: Status de casos (dados historicos)
- **LLM Service**: Scoring de confianca na deduplicacao
