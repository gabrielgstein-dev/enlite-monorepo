# Technical Debt — Enlite Monorepo

Lista de débitos técnicos conhecidos com contexto suficiente pra retomar o trabalho depois. Cada entrada tem: **problema**, **impacto**, **causa raiz**, **proposta de fix**, **prioridade**.

---

## TD-001 — Consolidação de workers duplicados (4 silos paralelos)

**Status**: Aberto desde 2026-04-24

### Problema

Workers reais (mesma pessoa física) aparecem em prod com **múltiplos registros**, cada um vindo de um caminho de import diferente. Phone idêntico, mesmo sobrenome, mas registros distintos.

Exemplo concreto descoberto durante sync ClickUp da Fase 2:
```
Mariana Pertine (mesma pessoa):
  1. pretaln_d0336a8a       email=pertinemariana@hotmail.com  phone=VAZIO          (Talentum prescreening)
  2. SzMrK...Rte2 (firebase) email=mlpj1985@gmail.com          phone=+541168450997 (Firebase auth — registrou na plataforma)
  3. anacare_05f400bb       email=at@pertinemariana.com       phone=5491168450997 (Ana Care/planilla)
```

### Os 4 silos identificados

| Prefix auth_uid | Origem | Estimativa em prod (2026-04-24) |
|---|---|---:|
| `pretaln_*` | Talentum prescreening webhook | 255+ workers (muitos sem phone) |
| `<firebase-uid>` | Worker registrou na plataforma Enlite (Firebase Auth) | 5203 workers |
| `anacare_*` | Importação Ana Care / planilha operativa | dezenas |
| `base1import_*` | Script seed antigo de planilla operativa | dezenas |
| `talentum_*` | `SyncTalentumWorkersUseCase` (Talentum dashboard) | 0 em prod hoje |
| `clickup_encuadre_*` | `import-encuadres-from-clickup.ts` (Fase 2) | 376 (criados em 2026-04-24) |

### Impacto

1. **Encuadres / matching incompleto**: 89 encuadres ClickUp NÃO foram criados na primeira execução (4% de loss em prod) porque o sync tentou preencher `phone` no worker `pretaln_*` mas o phone já estava em outro worker (firebase/anacare/base1import). Workaround aplicado em [TD-001-A](#td-001-a---workaround-imediato-aplicado): fillMissingWorkerFields skip phone update em caso de conflict.

2. **Métricas distorcidas**: contagem de "workers" em prod (~6400) inclui múltiplas vezes a mesma pessoa.

3. **Matchmaking ineficiente**: histórico de encuadres/aplicações de uma pessoa fica fragmentado em múltiplos worker_ids.

4. **Comunicação duplicada**: WhatsApp/email pode ser disparado pra "vários workers" que são a mesma pessoa.

### Causa raiz

Ao longo do tempo, vários caminhos de criação de worker foram adicionados sem checagem cross-source de duplicatas:
- Talentum webhook cria worker quando candidato faz prescreening (`pretaln_*`)
- Firebase Auth cria worker quando pessoa cria conta (auth_uid real)
- Scripts de import (Ana Care, planilha, ClickUp) criam workers com prefixos sintéticos

Cada path verifica dedup INTERNO ao seu silo (`auth_uid` não-nulo + email + phone), mas **não há lookup cross-source pré-INSERT**. Resultado: race conditions e dups acumulados.

### TD-001-A — Workaround imediato (APLICADO em 2026-04-24)

Patch em `worker-functions/scripts/encuadres-worker-upsert.ts`:
- Quando `fillMissingWorkerFields` precisa setar `phone` num worker existente e o phone candidato JÁ está em outro worker, **skip o phone update silenciosamente** (worker existente fica sem phone, mas o encuadre é criado).
- Loga WARN identificando os pares pra revisão manual futura.

Resultado: a sync ClickUp consegue criar todos os encuadres mesmo em presença de dups. Os dups continuam existindo — só não bloqueiam mais a sync.

### TD-001-B — Solução proper (PENDENTE)

Criar **Fase 5 — Worker Consolidation**:

1. **Script de detecção** `scripts/detect-worker-duplicates.ts`:
   - Agrupa workers por `phone` normalizado (sem +/espaços/9 móvel inserido)
   - Agrupa por `LOWER(email)` canonicalizado
   - Cross-references com nome similarity (Levenshtein) > 0.85
   - Output: CSV com pares/grupos suspeitos

2. **Script de merge** `scripts/merge-worker-duplicates.ts`:
   - Input: grupo de worker_ids consolidando em 1 principal
   - Regra de prioridade do "principal":
     1. Worker com Firebase auth_uid real (registrou na plataforma)
     2. Worker com `data_sources` mais rica (talent_search + ana_care + planilla...)
     3. Worker com `clickup_encuadre_*` (mais recente, dado completo)
     4. Talentum/anacare/base1import (silos sintéticos)
     5. `pretaln_*` (último — geralmente esqueleto)
   - Operações:
     - Migra `worker_id` em FKs (encuadres, worker_job_applications, worker_documents, worker_availability, etc) pra o principal
     - Concatena `data_sources` (DISTINCT)
     - Preserva `auth_uid` do principal
     - Set `merged_into_id` nos secundários (já existe no schema)

3. **Lookup global pré-INSERT** em **TODOS** os paths de criação de worker:
   - `encuadres-worker-upsert.ts` (já tem cascade email→phone, expandir)
   - `SyncTalentumWorkersUseCase` (Talentum dashboard)
   - `WorkerPrescreeningRepository` (`pretaln_*`)
   - `WorkerInitController` (Firebase auth path)
   - Scripts de import legados (`anacare_*`, `base1import_*`)

   Helper compartilhado: `findOrCreateWorkerCanonical(phone, email, name) -> workerId`. Único ponto de criação, com lookup cross-source antes de qualquer INSERT.

4. **Migration**: criar índice trigram (pg_trgm) sobre nome encriptado? Ou índice expression sobre LOWER(email) + normalized_phone? Avaliar custo vs benefício.

5. **Run em prod**:
   - Backup obrigatório
   - Detectar duplicatas (read-only) → revisar amostras com PO
   - Aplicar merges em batches, com `--dry-run` primeiro
   - Métricas pré/pós: contagem de workers, encuadres re-apontados, FKs migradas

### Estimativa

- TD-001-A: feito (~30 linhas + commit)
- TD-001-B: ~3-5 dias de dev (3 scripts + helper + migration + tests + prod run com revisão)

### Prioridade

**Alta** — afeta confiabilidade do matching, métricas operacionais e experiência do worker (recebe múltiplas mensagens). Não-bloqueante hoje (sistema funciona com workaround), mas custo aumenta com escala.

### Memórias relacionadas

- `feedback_qualified_only_talentum.md` — proteção de `application_funnel_stage` em sync
- `project_clickup_source_of_truth.md` — ClickUp como fonte principal pra alguns campos
- `project_data_layer_roadmap.md` — arquitetura-alvo (workers em case-service eventualmente)
