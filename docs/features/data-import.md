# Importacao de Dados (IMP)

## O que e

Pipeline de importacao que ingere dados de 4 fontes externas (Talentum, ClickUp, Planilla Operativa, Ana Care), detecta automaticamente o formato do arquivo, normaliza os dados e persiste no banco. Roda de forma assincrona (retorna 202 Accepted) com polling de status.

## Por que existe

Dados de workers e vagas vem de multiplos sistemas legados e planilhas manuais. O pipeline unifica tudo em um schema padronizado, evitando entrada manual e inconsistencias. A deteccao automatica de formato facilita o uso pelo admin sem conhecimento tecnico.

## Como funciona

### Fluxo de importacao

```
Admin faz upload do arquivo
  |  POST /api/import/upload (multipart/form-data)
  |  Retorna 202 Accepted + jobId
  v
Deteccao automatica de fonte
  |  Analisa headers/colunas do arquivo
  |  Instancia converter correto
  v
Converter processa linhas
  |  TalentumConverter (CSV Talentum ATS)
  |  ClickUpConverter (planilha ClickUp)
  |  PlanilhaOperativaConverter (planilha operacional)
  |  AnaCareConverter (planilha Ana Care)
  v
Normalizacao
  |  import-utils.ts: profissao, prioridade, status, telefone, etc.
  v
Persistencia
  |  Insere/atualiza workers e vagas no banco
  v
Pos-importacao
  |  linkWorkersByPhone() — vincula workers por telefone
  |  linkBlacklistByPhone() — vincula com blacklist
  |  syncToWorkerJobApplications() — sincroniza candidaturas
  v
Admin consulta status
  |  GET /api/import/status/:id (polling a cada 2s)
  |  Retorna: inserted, updated, errors, status
```

### Frontend (Admin Uploads)

```
4 zonas de upload:
  [Ana Care Control .xlsx]  [Candidatos .xlsx]
  [Planilla Operativa .xlsx]  [Talent Search .csv]

Upload -> Polling (max 30 tentativas, 2s intervalo) -> Resultado
  |  Timeout: 5 minutos para uploads grandes
  |  Exibe: inserted/updated/error counts
  |  Flag alreadyImported para duplicatas
```

## Endpoints

| Metodo | Rota | Funcao |
|--------|------|--------|
| POST | `/api/import/upload` | Upload e importacao async (202) |
| GET | `/api/import/status/:id` | Status do job (polling) |
| GET | `/api/import/history` | Historico de importacoes |

## Componentes

### Backend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/infrastructure/scripts/import-planilhas.ts` | PlanilhaImporter (orchestrador) |
| `src/infrastructure/converters/TalentumConverter.ts` | Converter Talentum CSV |
| `src/infrastructure/converters/ClickUpConverter.ts` | Converter ClickUp |
| `src/infrastructure/converters/PlanilhaOperativaConverter.ts` | Converter Planilla |
| `src/infrastructure/converters/AnaCareConverter.ts` | Converter Ana Care |
| `src/infrastructure/scripts/import-utils.ts` | Funcoes de normalizacao |
| `src/domain/ports/IFileConverter.ts` | Interface do converter |

### Frontend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/presentation/pages/admin/AdminUploadsPage.tsx` | Pagina de uploads |
| `src/hooks/useImportHistory.ts` | Hook historico |

## Regras de negocio

- **Deteccao automatica**: Analisa colunas/headers para identificar a fonte sem input do usuario
- **Normalizacao centralizada**: Todas as fontes passam pelas mesmas funcoes de normalizacao (profissao, prioridade, etc.)
- **Deduplicacao**: Workers identificados por telefone/email; atualiza se ja existe
- **Pos-importacao obrigatoria**: Apos inserir, executa vinculacao por telefone com workers existentes e blacklist
- **Sync candidaturas**: Cria registros em worker_job_applications para novos matches
- **Async processing**: Upload retorna 202 imediatamente; processamento em background
- **Polling frontend**: Max 30 tentativas com intervalo de 2s; timeout de 5 minutos
- **Formatos aceitos**: `.xlsx` (Ana Care, Candidatos, Planilla), `.csv` (Talentum)
- **Dual-use**: Importadores funcionam tanto via CLI quanto via HTTP

## Integracoes externas

- Nenhuma integracao externa direta — os dados vem de arquivos uploadados manualmente
- A deteccao de fonte e baseada no conteudo do arquivo, nao em metadata externa
