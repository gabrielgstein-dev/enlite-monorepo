# Matchmaking API

Documentação do sistema de matchmaking entre vagas (`job_postings`) e workers (ATs / Cuidadores).

---

## Visão Geral

O matchmaking opera em **3 fases** para rankear os candidatos mais compatíveis com uma vaga:

| Fase | Descrição | Critério |
|---|---|---|
| **1 — Hard Filter** | SQL — elimina candidatos incompatíveis | Ocupação, blacklist, raio geográfico, casos ativos |
| **2 — Structured Score** | Em memória (0–100) | Proximidade geográfica (km), diagnósticos, ocupação |
| **3 — LLM Score** | Groq API — analisa perfil completo (0–100) | Compatibilidade geral, horário, experiência, carga atual |

**Score final** = `structured_score × 0.35 + llm_score × 0.65`

---

## Endpoints

### `POST /api/admin/vacancies/:id/match`

Dispara o matchmaking para uma vaga específica. Retorna os candidatos rankeados e salva os resultados em `worker_job_applications`.

**Autenticação:** requer token de admin (`Authorization: Bearer <token>`)

#### Parâmetros de URL

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `id` | `uuid` | ID da vaga (`job_postings.id`) |

#### Query Parameters

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `top_n` | `integer` | `20` | Número de candidatos que passam para a Fase 3 (LLM) |
| `radius_km` | `integer` | `null` | Raio geográfico máximo em km. Requer que a vaga tenha coordenadas (`service_lat`/`service_lng`). Se omitido, sem filtro geográfico. |
| `exclude_active` | `boolean` | `false` | Se `true`, exclui do hard filter workers que já estão em casos ativos (`resultado = SELECCIONADO` em vagas não cobertas) |

#### Exemplos de uso

```bash
# Matchmaking básico — sem filtros extras
POST /api/admin/vacancies/1f744beb-cf4a-4e62-8171-16d07a3d5fb3/match

# Top 10, raio de 10km
POST /api/admin/vacancies/1f744beb-cf4a-4e62-8171-16d07a3d5fb3/match?top_n=10&radius_km=10

# Apenas workers sem casos ativos, raio de 20km
POST /api/admin/vacancies/1f744beb-cf4a-4e62-8171-16d07a3d5fb3/match?exclude_active=true&radius_km=20

# Apenas workers sem casos ativos, sem restrição de raio
POST /api/admin/vacancies/1f744beb-cf4a-4e62-8171-16d07a3d5fb3/match?exclude_active=true
```

#### Resposta

```json
{
  "success": true,
  "data": {
    "jobPostingId": "1f744beb-cf4a-4e62-8171-16d07a3d5fb3",
    "jobEnriched": true,
    "radiusKm": 10,
    "matchSummary": {
      "hardFilteredCount": 312,
      "llmScoredCount": 5
    },
    "candidates": [
      {
        "workerId": "uuid",
        "workerName": "Carmen Calles",
        "workerPhone": "541155551234",
        "occupation": "AT",
        "workZone": "Bahía Blanca 787, CABA",
        "distanceKm": 1.6,
        "activeCasesCount": 0,
        "structuredScore": 75,
        "llmScore": 60,
        "finalScore": 65,
        "llmReasoning": "El candidato coincide con el perfil profesional...",
        "llmStrengths": ["Adecuación del perfil", "Proximidad geográfica"],
        "llmRedFlags": ["Falta experiencia con depresión"],
        "alreadyApplied": false
      }
    ]
  }
}
```

#### Campos da resposta

**`matchSummary`**

| Campo | Descrição |
|---|---|
| `hardFilteredCount` | Workers que passaram pelo hard filter (Fase 1) |
| `llmScoredCount` | Workers que foram avaliados pelo LLM (Fase 3) |

**`candidates[]`**

| Campo | Tipo | Descrição |
|---|---|---|
| `workerId` | `uuid` | ID do worker |
| `workerName` | `string` | Nome descriptografado via KMS |
| `workerPhone` | `string` | Telefone do worker |
| `occupation` | `string` | `AT`, `CUIDADOR` ou `AMBOS` |
| `workZone` | `string \| null` | Zona de trabalho ou endereço (fallback) |
| `distanceKm` | `number \| null` | Distância em km até o endereço da vaga. `null` se sem coordenadas |
| `activeCasesCount` | `number` | Quantidade de casos ativos onde o worker está `SELECCIONADO` |
| `structuredScore` | `number` | Score determinístico (0–100) — Fase 2 |
| `llmScore` | `number \| null` | Score do LLM (0–100) — Fase 3. `null` se a chamada falhou |
| `finalScore` | `number` | Score final ponderado (0–100) |
| `llmReasoning` | `string \| null` | Explicação do LLM sobre a compatibilidade |
| `llmStrengths` | `string[]` | Pontos fortes identificados pelo LLM |
| `llmRedFlags` | `string[]` | Alertas identificados pelo LLM |
| `alreadyApplied` | `boolean` | `true` se o worker já tem registro em `worker_job_applications` para essa vaga |

---

### `POST /api/admin/vacancies/:id/enrich`

Re-parseia os campos de texto livre da vaga com LLM e salva os campos estruturados. Útil após edição manual da vaga.

O matchmaking chama este endpoint automaticamente quando a vaga ainda não foi enriquecida (`llm_enriched_at IS NULL`).

**Autenticação:** requer token de admin

```bash
POST /api/admin/vacancies/1f744beb-cf4a-4e62-8171-16d07a3d5fb3/enrich
```

#### Resposta

```json
{
  "success": true,
  "data": {
    "required_sex": "F",
    "required_profession": "AT",
    "required_specialties": ["estimulación cognitiva"],
    "required_diagnoses": ["depresión", "TEA"],
    "parsed_schedule": {
      "days": [1, 2, 3, 4, 5],
      "slots": [{ "start": "15:00", "end": "19:00" }],
      "interpretation": "Lunes a viernes de 15 a 19hs"
    }
  }
}
```

---

## Trigger automático na criação de vaga

Ao criar uma nova vaga via `POST /api/admin/vacancies`, o sistema dispara automaticamente em background:

1. Enriquecimento LLM da vaga (`/enrich`)
2. Matchmaking com configuração padrão (`top_n=20`, sem raio, sem `exclude_active`)

O response da criação retorna imediatamente (201). O matchmaking ocorre nos bastidores (~30–60 segundos) e os resultados ficam disponíveis em `worker_job_applications`.

---

## Como o scoring funciona

### Fase 2 — Structured Score (0–100)

| Critério | Pontuação | Condição |
|---|---|---|
| **Ocupação** | +40 | Ocupação do worker = profissão requerida pela vaga |
| | +28 | Worker é `AMBOS` |
| | +20 | Vaga sem profissão especificada (neutro) |
| | +0 | Mismatch |
| **Proximidade** | +35 | < 5 km |
| | +28 | 5–10 km |
| | +18 | 10–20 km |
| | +8 | 20–40 km |
| | +2 | > 40 km |
| | +15 | Sem coordenadas (neutro) |
| **Diagnósticos** | +0–25 | Proporcional ao match entre `diagnostic_preferences` do worker e `llm_required_diagnoses` da vaga |
| | +12 | Vaga sem diagnóstico especificado (neutro) |

### Fase 3 — LLM Score (0–100)

O LLM (Groq `llama-3.3-70b-versatile`) recebe:

- Perfil completo da vaga (texto livre + campos estruturados)
- Ocupação, zona, distância, sexo do worker
- Notas de disponibilidade e experiência extraídas de encuadres anteriores
- **Casos ativos atuais** com horário estimado (cruzamento `SELECCIONADO` × `schedule_days_hours`)
- Nível de interesse e potencial de follow-up de encuadres anteriores

---

## Dados persistidos

Ao final do matchmaking, os resultados são salvos via UPSERT em `worker_job_applications`:

| Coluna | Valor |
|---|---|
| `worker_id` | ID do worker |
| `job_posting_id` | ID da vaga |
| `match_score` | `finalScore` |
| `application_status` | `under_review` |
| `internal_notes` | `llmReasoning` |

Se já existia um registro para o par worker+vaga, o score e as notas são atualizados.

---

## Limitações conhecidas

- **Horário do worker por caso**: o campo `activeCasesCount` e o horário passado ao LLM são estimativas baseadas no cruzamento `resultado = SELECCIONADO` × `schedule_days_hours` da vaga. Para casos com múltiplos ATs, o horário exibido é o total do caso, não o turno específico do worker.
- **`exclude_active`**: baseia-se em `encuadres.resultado = 'SELECCIONADO'` em vagas com `is_covered = false`. Workers que encerraram um caso mas não foram atualizados na planilha podem aparecer como "com caso ativo".
- **Sexo**: o campo `sex_encrypted` é descriptografado via KMS apenas na Fase 3 (top N). O hard filter não filtra por sexo — isso é avaliado pelo LLM.
