# 📊 Análise Rigorosa: Planilla_Operativa_Encuadre.xlsx
## Extração de Dados Valiosos + Gap Analysis do Schema

**Data da análise:** 2026-03-22  
**Arquivo:** `Planilla_Operativa_Encuadre.xlsx`  
**Escopo:** O que extrair, onde guardar, e como isso potencializa o MATCH worker × vaga.

---

## 🗺️ Mapa das Abas do Arquivo

| Aba | Registros | O que é |
|-----|-----------|---------|
| `_Base1` | **27.671 linhas** | Central de encuadres — a espinha dorsal de todo o processo de triagem |
| `_Índice` | **327 casos** | Índice dos pacientes — status, dependência, prioridade |
| `_Publicaciones` | **6.149 registros** | Log de publicações das vagas em canais/grupos |
| `_BlackList` | **82 workers** | Workers vetados com motivo, dados demográficos extras |
| `_Mod` | **100 linhas** | Versão ampliada do _Base1 com campos extras (HORA, MEET, ORIGEM) |
| Individual (`738 - Silva Lautaro` etc.) | **~260 abas por caso** | Cada caso tem sua própria aba com a mesma estrutura do _Mod |
| `_AuditoriaOnboarding` | Template vazio | Sistema de avaliação pós-alocação (Calificação 1–5) |
| `_HorasSemanales` | **5 coordenadores** | Horas semanais de cada coordenador por período |
| `_ET GENERAL` | 64 linhas | Tracking adicional por equipe |
| `_Desplegables` | Lookup | Listas de valores dropdown (enum source) |

---

## 🚨 GAPS CRÍTICOS NO SCHEMA ATUAL

### 1. `job_postings.status` — enum incompleto

**Atual no schema:**
```sql
CHECK (status IN ('draft', 'active', 'paused', 'closed', 'filled'))
```

**Valores reais na planilha `_Índice`:**
| Valor planilha | Frequência | Mapeamento correto |
|---|---|---|
| `RTA RAPIDA` | 147 | → `active` (mas indica urgência extrema, perda semântica) |
| `ACTIVO` | 82 | → `active` |
| `REEMPLAZO` | 48 | **FALTA** — caso tem AT mas precisa de substituto |
| `SUSPENDIDO` | 31 | → `paused` |
| `BUSQUEDA` | 12 | **FALTA** — busca ativa em andamento |
| `EN ESPERA` | 5 | **FALTA** — aguardando decisão |

**Impacto no MATCH:** `REEMPLAZO` é uma categoria crítica de matching — o worker precisa cobrir rapidamente alguém que saiu. Não ter isso é perda de priorização.

---

### 2. `job_postings.dependency` — enum incompleto

**Atual no schema:**
```sql
CHECK (dependency IN ('GRAVE','MUY_GRAVE'))
```

**Valores reais:**
| Valor | Frequência |
|---|---|
| `GRAVE` | 97 |
| `MODERADA` | 57 |
| `MUY GRAVE` | 39 |
| `LEVE` | 11 |

**Impacto no MATCH:** A `MODERADA` representa 17% dos casos — todos estão sendo ignorados no matching por dependência. Um worker sem experiência pesada pode ser perfeito para `MODERADA`.

---

### 3. `job_postings.priority` — enum incompleto

**Atual no schema:**
```sql
CHECK (priority IN ('URGENTE','NORMAL'))
```

**Valores reais:**
| Valor | Frequência |
|---|---|
| `ALTA` | 91 |
| `URGENTE` | 83 |
| `NORMAL` | 38 |
| `BAJA` | 31 |

**Impacto no MATCH:** `ALTA` é o maior grupo e não existe no schema. 91 casos com prioridade `ALTA` estão sendo classificados incorretamente.

---

### 4. `encuadres.motivo_rechazo` — texto livre vs. enum estruturado

**Campo atual:** `rejection_reason TEXT` (texto livre)

**Valores REAIS na planilha (apenas 3 valores distintos):**
```
'Otros'                  → 1.949 ocorrências
'Horarios incompatibles' →   623 ocorrências
'Distancia al dispositivo' → 429 ocorrências
```

**Este campo É um enum disfarçado de texto livre.** Deve ser:
```sql
rejection_reason VARCHAR(30) CHECK (rejection_reason IN (
  'Otros', 'Horarios incompatibles', 'Distancia al dispositivo'
))
```

**Impacto no MATCH:** Se soubermos que um worker rejeitou 3 casos por "Distancia al dispositivo", podemos filtrar automaticamente casos fora da sua zona. Hoje isso não é possível.

---

### 5. `job_postings.is_covered` — campo existe mas não é importado

**Campo na planilha `_Índice`:** `Está acompañada?` (boolean, 0/1)  
**Impacto:** Se o caso JÁ tem um AT cobrindo, não deveria estar em busca ativa. Hoje a query de matching não sabe disso.

---

## 📋 CAMPOS NOVOS A EXTRAIR

### 5.1 Da `_Índice` → `job_postings` (ENRICH)

```sql
-- Campos a adicionar/corrigir em job_postings:
ALTER TABLE job_postings
  -- Expandir o status para incluir valores reais:
  DROP CONSTRAINT IF EXISTS valid_job_status,
  ADD CONSTRAINT valid_job_status CHECK (status IN (
    'draft', 'active', 'rta_rapida', 'busqueda', 'reemplazo',
    'en_espera', 'paused', 'closed', 'filled'
  )),

  -- Expandir dependência:
  DROP CONSTRAINT IF EXISTS ...,
  ADD CONSTRAINT check_dependency CHECK (dependency IN (
    'LEVE', 'MODERADA', 'GRAVE', 'MUY_GRAVE'
  )),

  -- Expandir prioridade:
  ADD CONSTRAINT check_priority CHECK (priority IN (
    'BAJA', 'NORMAL', 'ALTA', 'URGENTE'
  )),

  -- Campo de observação diária (contexto operacional vivo):
  ADD COLUMN IF NOT EXISTS daily_obs TEXT,

  -- Campo de revisão (quem está acompanhando o caso hoje):
  ADD COLUMN IF NOT EXISTS review_status TEXT;
```

---

### 5.2 Da `_Publicaciones` → `publications` (JÁ EXISTE — enriquecer)

O campo `Grupos / Comunidades` contém intel geográfica preciosa:
```
'Acompañantes Terapéuticos Mar del Plata'  → vaga em Mar del Plata
'AT´s Zona Norte'                           → vaga em Zona Norte (CABA)
'Bolsa de trabajos en Bahía Blanca'         → vaga em Bahía Blanca
'Grupos AT zona norte/Bolsa de trabajos en Zona Norte/CAMPANA ANUNCIOS'
```

**O que fazer:** Extrair e geocodificar os grupos para enriquecer `job_postings` com zona geográfica real. Hoje os casos não têm cidade/bairro explícito — os grupos de publicação são a proxy mais confiável.

```sql
-- Novo campo em job_postings:
ADD COLUMN IF NOT EXISTS inferred_zone TEXT; -- extraído de Grupos/Comunidades

-- E no publications:
ADD COLUMN IF NOT EXISTS group_geographic_zone TEXT; -- zona inferida do nome do grupo
```

---

### 5.3 Da `_BlackList` → `blacklist` + `workers` (ENRICH)

**Campos que existem na BlackList mas NÃO no schema atual:**

| Campo planilha | Coluna DB proposta | Tabela |
|---|---|---|
| `Formação` | `formation_type VARCHAR(50)` | `workers` |
| `EDAD` | já existe como `birth_date_encrypted` | `workers` |
| `SEXO` | já existe como `sex_encrypted` | `workers` |
| `Provincia` | `province VARCHAR(100)` | `worker_locations` |
| `Ciudad` | `city` | `worker_locations` |
| `PUEDE TOMAR EVENTUAL` | já existe em `blacklist.can_take_eventual` | `blacklist` |
| `Registrado por` | já existe em `blacklist.registered_by` | `blacklist` |
| `Observaciones` | já existe em `blacklist.detail` | `blacklist` |

**Prioridade de extração:** A `Formação` da BlackList é o único lugar onde aparece explicitamente o tipo de formação (Acompañante Terapéutico, Psicólogo, etc.) fora do texto livre das observações.

---

### 5.4 Da `_Mod` + Case Sheets → `encuadres` (SUPPLEMENT)

As abas individuais por caso têm 4 campos extras que a `_Base1` não tem:

| Campo planilha | Campo DB | Status |
|---|---|---|
| `ORIGEN` | `encuadres.origen` | ✅ Migration 017 |
| `HORA ENCUADRE` | `encuadres.interview_time` | ✅ Schema OK |
| `ID ENCUADRE MEET` | `encuadres.meet_link` | ✅ Schema OK |
| `ID ONBOARDING` | `encuadres.id_onboarding` | ✅ Migration 017 |

**Ação necessária:** O `ORIGEN` revela de onde o worker foi captado (Talentum, grupo wsp, Facebook, etc.) para cada encuadre específico. Isso é critical intelligence para futuros canais de captação.

---

### 5.5 Da `_AuditoriaOnboarding` → NOVA TABELA (alta prioridade)

**Esta aba é o sistema de qualidade pós-alocação.** Quando um worker é SELECCIONADO, o processo de onboarding é auditado.

```sql
-- NOVA TABELA: worker_placement_audits
CREATE TABLE IF NOT EXISTS worker_placement_audits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Chave do sistema de auditoria da planilha
  audit_order     INTEGER,
  audit_id        VARCHAR(20) NOT NULL,   -- formato: "--1", "--2"
  audit_date      DATE,

  -- Relacionamentos
  worker_id       UUID REFERENCES workers(id) ON DELETE SET NULL,
  job_posting_id  UUID REFERENCES job_postings(id) ON DELETE CASCADE,

  -- Dados brutos (para rastreabilidade)
  worker_raw_name VARCHAR(200),
  patient_raw_name VARCHAR(200),
  coordinator_name VARCHAR(100),
  case_number_raw  INTEGER,

  -- Avaliação (Calificación #)
  rating          SMALLINT CHECK (rating BETWEEN 1 AND 5),
  observations    TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**Por que isso é CRÍTICO para matching:** A `Calificação` pós-alocação é o único feedback estruturado sobre a QUALIDADE do worker em serviço. Um worker com rating 5 em 3 alocações anteriores tem prioridade máxima no matching.

---

### 5.6 Da `_HorasSemanales` → NOVA TABELA ou `staff_schedules`

```sql
-- NOVA TABELA: coordinator_weekly_schedules
CREATE TABLE IF NOT EXISTS coordinator_weekly_schedules (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coordinator_name VARCHAR(100) NOT NULL,
  coordinator_dni  VARCHAR(20),
  from_date    DATE NOT NULL,
  to_date      DATE NOT NULL,
  weekly_hours DECIMAL(5,2),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

**Por que importa para matching:** Se uma coordenadora tem apenas 3h/semana, ela não pode gerenciar muitos casos ativos. O matching precisa considerar a capacidade de quem vai fazer o onboarding.

---

## 🎯 MAPA DE PRIORIDADES PARA MATCHING

### Tier 1: CRÍTICO — Impacta diretamente o algoritmo de match

| Dado | Origem | Tabela destino | Por que importa |
|---|---|---|---|
| `motivo_rechazo` estruturado | `_Base1` | `encuadres` | Filtra workers que rejeitam por distância ou horário incompatível ANTES de enviar |
| `dependency` expandido (MODERADA/LEVE) | `_Índice` | `job_postings` | Segmenta corretamente nível de exigência → workers menos experientes podem ir para casos LEVE/MODERADA |
| `priority` expandido (ALTA/BAJA) | `_Índice` | `job_postings` | Ordena fila de contato: URGENTE+ALTA primeiro, BAJA por último |
| `status` expandido (REEMPLAZO) | `_Índice` | `job_postings` | `REEMPLAZO` = contato imediato, requer worker disponível TODAY |
| `is_covered` | `_Índice` | `job_postings` | Não envia workers para caso já coberto |
| Histórico `RESULTADO` por worker × caso | `_Base1` | `encuadres` | Um worker RECHAZADO para caso GRAVE não deve receber caso GRAVE similar |

---

### Tier 2: ALTO VALOR — Enriquece scoring de match

| Dado | Origem | Uso no match |
|---|---|---|
| Texto de `Obs. ENCUADRE` | `_Base1` | 9.031 textos com disponibilidade real ("lunes a viernes 8 a 14hs") — extrair com LLM para enrichment de `worker_availability` |
| `ORIGEN` por encuadre | `_Mod` + Case sheets | Qual canal captou workers com SELECCIONADO? Informar onde publicar futuros casos |
| `rating` de auditoria | `_AuditoriaOnboarding` | Worker rated 4–5 = boost no score de match |
| `inferred_zone` dos grupos | `_Publicaciones` | Inferir localização do caso sem geocodificação explícita |
| Histórico de `REDIRECCIONAMIENTO` | `_Base1` | Worker que aceita ser redirecionado para outros casos = alta flexibilidade |

---

### Tier 3: INTELIGÊNCIA ESTRATÉGICA — Para dashboards e decisões

| Dado | Origem | Uso |
|---|---|---|
| Frequência de publicação por canal × resultado | `_Publicaciones` | Quais grupos geram mais SELECCIONADO? Otimizar onde publicar |
| Workers na BlackList com `PUEDE TOMAR EVENTUAL=1` | `_BlackList` | Pool de emergência — vetados para permanente mas ok para eventual |
| Casos com mais de 200 encuadres sem SELECCIONADO | `_Base1` | Casos problemáticos — precisam de intervenção humana, não mais automation |
| Coordenadora × taxa de sucesso dos encuadres | `_Base1` | Quem converte melhor? Alocar coordenadora certa para caso urgente |

---

## 🔧 MIGRATIONS NECESSÁRIAS (em ordem de prioridade)

### Migration 035: Expand job_postings enums
```sql
-- Expandir status, dependency e priority com valores reais da planilha
-- Adicionar daily_obs, inferred_zone
```

### Migration 036: Structured rejection reason
```sql
-- Converter encuadres.rejection_reason de TEXT para VARCHAR(30)
-- com CHECK constraint dos 3 valores reais
```

### Migration 037: worker_placement_audits
```sql
-- Nova tabela de auditoria de onboarding com rating 1–5
-- Chave de matching de qualidade pós-alocação
```

### Migration 038: Coordinator schedules
```sql
-- coordinator_weekly_schedules
-- Capacidade operacional do time
```

### Migration 039: Geographic inference
```sql
-- job_postings.inferred_zone
-- publications.group_geographic_zone
```

---

## 💡 OBSERVAÇÕES FINAIS SOBRE O DADO

1. **`Obs. ENCUADRE` é uma mina de ouro não explorada.** Com 9.031 registros e média de 56 chars, contém horários reais dos workers ("lunes a viernes de 8 a 14hs"), especializações ("psicóloga e AT, experiência em integración escolar"), e restrições geográficas. O pipeline LLM já existe para `obs_reclutamiento` — deve ser extendido para esse campo.

2. **O `ID ONBOARDING` conecta `encuadres` com `worker_placement_audits`.** Quando preenchido, indica que o encuadre evoluiu para alocação real e está sendo monitorado. Esse é o link entre o funil de triagem e o resultado final.

3. **Caso `0` tem 201 workers SELECCIONADOS** — é o pool geral ("General Cuidadora", "AT Mujeres O'Gorman"). Esses cases precisam de tratamento especial na query de matching.

4. **Média de 128 encuadres por caso** (mediana 54) com max de 3.791. Casos com muitos encuadres sem resultado são candidatos a revisão manual — o algoritmo de matching deve sinalizar isso.

5. **`REDIRECCIONAMIENTO`** contém casos onde o worker foi direcionado para outro case após rejeição ("AT (Acompañante Terapéutico)", "se postulo por talentum general CUIDADORES"). Isso indica **mobilidade cross-case** — uma das métricas mais valiosas para o sistema.
