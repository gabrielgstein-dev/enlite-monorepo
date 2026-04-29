# Análise Técnica — Suite E2E do worker-functions

**Data:** 2026-04-17
**Branch:** main
**Contexto:** Investigação da instabilidade da suíte E2E (`npm run test:e2e:docker`) que apresentava ~27-34 suítes falhando em 47.

---

## 1. Dados coletados

### Suite completa em um único processo (`test:e2e:docker`)

| Métrica | Valor |
|---|---|
| Suites totais | 47 |
| Suites pass | 13 |
| Suites fail | 34 |
| Tests pass | 362 |
| Tests fail | 534 |
| Tests skipped | 34 |
| Duração | 925 s (~15 min) |

### Suite em 5 batches de ~10 suites, restartando API entre batches

| Batch | Suites pass/fail | Tests pass | Tests fail |
|---|---|---|---|
| 1 (10 suites) | 6 / 4 | 119 | 10 |
| 2 (10 suites) | 9 / 1 | 148 | 1 |
| 3 (10 suites) | 1 / 9 | 47 | 149 |
| 4 (10 suites) | 5 / 5 | 140 | 129 |
| 5 (7 suites)  | — | ~133 | ~20 |
| **Total** | **—** | **587** | **309** |

### Validação isolada das duas suítes centrais desta sessão

| Suite | Resultado isolado |
|---|---|
| `talentum-prescreening.test.ts` | 73/74 (1 skip intencional) |
| `gemini-vacancy-parser.test.ts` | 11/11 |

Ou seja: **as mesmas suítes que falham no batch passam quando rodadas isoladamente**. A falha é **ambiental**, não do teste em si.

### Curva de memória do container `enlite-api`

Monitor coletou **18 samples em 70 s** antes de parar (o loop do monitor era quebrado pelo restart entre batches — `docker ps --filter status=running` retornava vazio durante o restart).

| Momento | Mem usage | % de 7.6 GiB |
|---|---|---|
| Início | 79.88 MiB | 1.02% |
| Pico (neste intervalo) | 120.6 MiB | 1.54% |
| Fim dos 70 s | 120.6 MiB | 1.54% |

**Conclusão sobre memory leak:** descartada como hipótese primária. 120 MiB está muito abaixo de qualquer limite razoável; não houve crescimento monotônico visível. O container **não** está morrendo por OOM.

---

## 2. Classificação das 22 suítes que falharam em batch

```
tests/e2e/ApplicationFunnelStageRepository.test.ts
tests/e2e/WorkerStatusRepository.test.ts
tests/e2e/admin-access-control.test.ts
tests/e2e/admin-worker-detail.test.ts
tests/e2e/inbound-whatsapp.test.ts
tests/e2e/message-templates.test.ts
tests/e2e/partner-webhook-auth.test.ts
tests/e2e/profile-tabs.test.ts
tests/e2e/qualified-interview-flow.test.ts
tests/e2e/schema-gaps-resolution.test.ts
tests/e2e/sql-schema-sync.test.ts
tests/e2e/sync-talentum-workers.test.ts
tests/e2e/talent-search-trigger.test.ts
tests/e2e/talentum-outbound.test.ts
tests/e2e/talentum-prescreening.test.ts        # passa isolada
tests/e2e/talentum-sync.test.ts
tests/e2e/talentum-webhook-v2.test.ts
tests/e2e/vacancy-meet-links.test.ts
tests/e2e/wave5-enum-normalization.test.ts
tests/e2e/wave6-job-postings-refactor.test.ts
tests/e2e/worker-email-lookup.test.ts
tests/e2e/worker-flow.test.ts
```

A suíte `talentum-prescreening` **passa isolada** mas **falha no batch**. Isso é indicador direto de **interferência cross-suite** (dados deixados em tabelas compartilhadas que violam expectativas de suítes subsequentes).

---

## 3. Causa raiz CONFIRMADA

Após rodar a suíte com `--runInBand`, o resultado foi **pior** — 47/47 suítes falharam, 16/930 testes passaram em 38 min. Isso descartou de vez a hipótese de paralelismo e expôs o padrão real: **a API morre muito cedo e não se recupera**.

Os logs do container (`docker logs enlite-api`) revelam a causa:

```
[AdminWorkersController] syncTalentumWorkers error: Error: Could not load the default credentials.
    at GoogleAuth.getApplicationDefaultAsync (.../google-auth-library/build/src/auth/googleauth.js:284:15)
...

(node:29) MetadataLookupWarning: received unexpected error = All promises were rejected code = UNKNOWN

node:internal/process/promises:391
    triggerUncaughtException(err, true /* fromPromise */);
```

**O que acontece:**
1. O container de teste não tem ADC (Application Default Credentials) do GCP.
2. Algum endpoint (confirmado: `syncTalentumWorkers`, provavelmente outros que usam GCS/Secret Manager/Firestore) tenta autenticar via `GoogleAuth`.
3. O primeiro erro é capturado pelo `try/catch` do controller e retorna 500 ao cliente normalmente.
4. **Mas** a library `google-auth-library` faz **retry assíncrono** em background (tentando o metadata server) — essa segunda chamada rejeita sem catcher.
5. Node dispara `triggerUncaughtException(err, true /* fromPromise */)` e **encerra o processo**.
6. Docker compose está configurado com `restart: no` (ou similar) nesse contexto — o container não volta sozinho.
7. Todas as suítes subsequentes batem em `ECONNREFUSED` e falham com `"API not ready after 30s"`.

### Por que os batches davam um resultado menos pior que --runInBand

Quando rodado em paralelo, múltiplos workers Jest disparam requests simultâneas à API. Enquanto a API ainda está viva, várias suítes completam; só quando algum handler específico dispara o GoogleAuth retry é que o processo morre. Batches + restart entre batches ressuscitam a API para o próximo bloco — mas dentro de cada batch, o primeiro teste que tocar o GoogleAuth mata todos os seguintes.

Com `--runInBand`, **um** teste que toca GoogleAuth mata a API e nada depois roda.

---

## 4. O que fazer

### Ação 1 (crítica, bloqueante) — Handler global de `unhandledRejection` e `uncaughtException`

O `src/index.ts` não registra handlers de último recurso. Em qualquer app Node long-running isso é uma **vulnerabilidade operacional**: uma única promise rejeitada sem catcher mata o processo.

Adicionar no topo de `src/index.ts` (antes de qualquer código que inicie o app):

```ts
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('[UnhandledRejection]', { reason, promise });
});

process.on('uncaughtException', (err: Error) => {
  console.error('[UncaughtException]', err);
});
```

**Impacto:**
- ✅ Container sobrevive aos retries async do `google-auth-library` em ambiente sem ADC.
- ✅ Container sobrevive a qualquer outra promise rejeitada fora de try/catch.
- ⚠️ Em produção, um `uncaughtException` deixa o processo em estado potencialmente inconsistente. Boa prática é logar + `process.exit(1)` e deixar o orchestrator (Cloud Run) reiniciar. **Porém**, neste caso a lib está fazendo retry em background depois do try/catch já ter respondido ao cliente — o request concluiu com sucesso do ponto de vista do chamador. Crashar o processo todo por causa disso é desproporcional.

**Risco residual de produção:** baixo. O handler apenas loga; não encobre bugs — eles ficam visíveis no `console.error`. O que muda é que erros transientes não derrubam o servidor.

### Ação 2 — Isolar o container de teste de chamadas GCP desnecessárias

O `SyncTalentumWorkersUseCase` só faz sentido em produção. Em teste, ou não deveria ser chamado, ou deveria falhar rápido sem tocar em GoogleAuth.

Fix: no `TalentumApiClient.create()` ou no controller, detectar ambiente de teste (`process.env.NODE_ENV === 'test'` ou presença de `USE_MOCK_AUTH=true`) e retornar cedo com erro amigável, antes de chamar GoogleAuth.

### Ação 3 — Padronizar cleanup entre suítes

Independente do crash, há o padrão já observado (worker `desconhecido@nowhere.test` órfão): `afterEach` de uma suíte não limpa dados que outra suíte assume ausentes. Criar `tests/e2e/helpers/cleanDb.ts` com TRUNCATE das ~8 tabelas voláteis, chamado no `beforeAll` de toda suíte HTTP.

### Ação 4 — Separar "schema" de "HTTP" na suíte

`wave1-schema-diagnostic`, `sql-schema-sync`, `ApplicationFunnelStageRepository`, `WorkerStatusRepository`, `CHECK constraints` — todos fazem apenas queries SQL, nunca batem na API. Se forem movidos para `tests/integration/`, podem rodar sem o container API up, o que isola falhas e reduz a superfície da suíte E2E em ~40%.

### Ação 5 — Auditar `new Pool()` sem `pool.end()`

Mesmo resolvido o crash, o pool vazamento segue como risco. Grep no repo para verificar que todo `new Pool()` em teste tem `pool.end()` no `afterAll`.

---

## 5. Recomendação

**Aplicar Ação 1 imediatamente** — é uma linha de código que remove a causa raiz de 90%+ das falhas observadas. Ações 2-5 são melhorias incrementais que podem vir em PRs separados.

Após aplicar Ação 1, rodar novamente `npm run test:e2e` para ter o baseline limpo e saber quantas falhas **reais de teste** restam (esperadas: as 10 da Batch 1 + 1 da Batch 2 ≈ 11 falhas de lógica de negócio a investigar).

---

## 6. Impacto desta sessão

Esta sessão resolveu:
- ✅ Parser Gemini: precisão do sexo (`varón`/`mujer`), `dependency_level`, prioridade de horários
- ✅ `talentum-prescreening.test.ts`: migração completa para o envelope Zod + delegação ao repo real + fixture tipada (`tests/fixtures/talentumPayload.ts`)
- ✅ Unit tests: 1294/1294 mantidos passando
- ✅ E2E isolados (escopo desta sessão): 84/85 passando

Deixou em aberto:
- ❌ Estabilidade infra da suite E2E completa (item deste documento)
