# Improve 003 — Firebase Admin SDK crasha container de E2E em modo mock (Docker)

## Status
Aberto. Identificado durante o QA da feature de admin users (abril/2026), bloqueou a execução de E2E backend da feature.

## Localização
[worker-functions/src/infrastructure/services/MultiAuthService.ts:17-34](../../worker-functions/src/infrastructure/services/MultiAuthService.ts#L17-L34)

```ts
// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  const projectId = process.env.GCP_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || (process.env.NODE_ENV === 'production' ? 'enlite-prd' : 'enlite-e2e-test');
  const storageBucket = process.env.GCS_BUCKET_NAME || `${projectId}.appspot.com`;

  admin.initializeApp({
    projectId,
    storageBucket,
  });
  // ...
}
```

## Problema

A inicialização do Firebase Admin SDK acontece **em top-level do módulo** (fora de qualquer função, em import-time). Quando esse módulo é carregado em ambiente sem `GOOGLE_APPLICATION_CREDENTIALS` definido (ex: Docker de E2E com `USE_MOCK_AUTH=true`), o SDK tenta resolver credenciais padrão do GCP (Metadata Server / Application Default Credentials) e crasha o processo inteiro com:

```
Error: Could not load the default credentials.
```

O erro acontece **antes** de qualquer requisição HTTP, antes de qualquer checagem de `USE_MOCK_AUTH`. O container `enlite-api` simplesmente sobe e morre, e todo E2E que dependa da API falha com:

```
Backend not ready after max retries
```

### Reprodução
```bash
cd worker-functions
npm run test:e2e:docker  # ou qualquer variante que não monte GOOGLE_APPLICATION_CREDENTIALS
```

O container de API crasha no startup, derrubando toda a suíte E2E.

### Impacto desta feature
Todos os 11 testes do novo `admin-role-update.test.ts` **não puderam ser validados** por esse motivo. O código foi inspecionado manualmente pelo QA, mas execução real ficou pendente de CI/correção da infra.

## Por que precisamos arrumar

1. **Bloqueio de validação em E2E backend**: qualquer dev ou CI que tente rodar E2E localmente sem credenciais GCP montadas vai bater nesse crash. Isso:
   - Empurra a validação só pra CI (quem tem as credenciais de service account), retardando feedback no ciclo de desenvolvimento.
   - Cria uma barreira de entrada pra novos devs: "pra rodar o E2E você precisa pedir as credenciais GCP" em vez de "rode `npm run test:e2e:docker`".
2. **`USE_MOCK_AUTH` não cumpre seu contrato**: o flag existe exatamente pra tirar o Firebase do caminho em ambiente de teste, mas é ignorado no startup. Flag que mente é pior que flag que não existe.
3. **Regressão silenciosa**: quando um teste E2E falha por infra, devs tendem a marcar como "flaky" e continuar. Um crash de startup mascara qualquer bug real de código que estaria sendo coberto pelos E2E.
4. **Padrão anti-DI**: inicialização em top-level é ruim em geral — dificulta teste, impede injeção de dependência, acopla o módulo ao SDK de forma irreversível.

## Proposta de correção

### Opção A (mínima, recomendada pra curto prazo) — Checar `USE_MOCK_AUTH` antes de `initializeApp`

```ts
if (!admin.apps.length) {
  const useMockAuth = process.env.USE_MOCK_AUTH === 'true';

  if (!useMockAuth) {
    const projectId = process.env.GCP_PROJECT_ID || /* ... */;
    admin.initializeApp({ projectId, storageBucket });
    // ...
  } else {
    console.log('[Firebase Admin] Skipped initialization (USE_MOCK_AUTH=true)');
  }
}
```

Vantagem: mudança pontual, não quebra nada.
Desvantagem: qualquer chamada a `admin.auth()` em código de produção passa a precisar de guardas tipo `if (process.env.USE_MOCK_AUTH !== 'true') { ... }`, o que espalha o flag pelo código.

### Opção B (melhor arquiteturalmente, esforço médio) — Injetar Firebase via port/adapter

Criar `IFirebaseAdminAuth` no domain, com implementação real (`FirebaseAdminAuth`) e mock (`MockFirebaseAdminAuth`). Os use cases (`CreateAdminUserUseCase`, `UpdateAdminRoleUseCase`, `GetAdminProfileUseCase`, etc.) recebem a interface via DI. Na startup do app, escolhe a implementação com base em `USE_MOCK_AUTH`.

Vantagem:
- Remove a dependência direta de `firebase-admin` dos use cases (Clean Architecture canonical).
- Testes unitários ficam triviais (injeta mock).
- `initializeApp` só acontece quando a implementação real é instanciada.

Desvantagem: refactor maior — mexe em todos os use cases que usam `admin.auth()` diretamente (vários).

### Opção C (compromisso) — Lazy init encapsulada

Criar `getFirebaseAdmin()` que inicializa on-demand, com um fast-path pra `USE_MOCK_AUTH`:

```ts
let initialized = false;
export function getFirebaseAdmin() {
  if (process.env.USE_MOCK_AUTH === 'true') {
    return mockFirebaseAdmin;  // stub que retorna promises válidas
  }
  if (!initialized) {
    admin.initializeApp({ /* ... */ });
    initialized = true;
  }
  return admin;
}
```

Todo import direto de `firebase-admin` é substituído por `getFirebaseAdmin()`.

## Minha recomendação

**Começar pela Opção A** (fix pontual de 5 linhas) pra desbloquear E2E imediatamente, e **agendar a Opção B** como refactor técnico para o próximo ciclo. A Opção B é a forma "correta" por Clean Architecture, mas tem custo alto e não urge — o importante agora é destravar a validação local.

## Critérios de aceite
- Container de API sobe com `USE_MOCK_AUTH=true` sem precisar de `GOOGLE_APPLICATION_CREDENTIALS`.
- `npm run test:e2e:docker` roda do zero em qualquer máquina dev sem configuração GCP.
- Os testes E2E que dependem de `admin.auth()` conseguem simular respostas (criar user fake, gerar link fake, custom claims mocados). Isso pode exigir um mock-module de Firebase Auth em `tests/mocks/firebase-admin.ts` — verificar se já existe.
- Em produção e em ambientes com credenciais reais, comportamento permanece idêntico ao de hoje (zero regressão funcional).
- `admin-role-update.test.ts` (e qualquer outro E2E bloqueado por esse crash) passa a rodar até o fim.

## Esforço estimado
- **Opção A**: 1 hora (inclui teste de validação).
- **Opção B**: 1-2 dias (refactor cross-cutting em use cases de admin).
- **Opção C**: 4-6 horas.

## Prioridade
**Alta** para o item de infra — **todos** os E2E backend que tocam Firebase ficam comprometidos enquanto esse bug existir. Quanto mais feature for entrando sem E2E passando localmente, mais risco de bugs chegarem em produção sem detecção.

## Considerações adicionais

- **Arquivos candidatos a auditar junto**: qualquer outro serviço que importe `firebase-admin` em top-level pode ter o mesmo problema. Rodar:
  ```bash
  grep -rn "admin.initializeApp\|admin.apps.length" worker-functions/src/
  ```
- **Verificar `docker-compose.yml` do E2E** pra confirmar se `USE_MOCK_AUTH=true` está setado e se o service `enlite-api` tem o env correto.
- **Documento relacionado**: [docs/E2E_INFRA_ANALYSIS.md](../E2E_INFRA_ANALYSIS.md) — se ainda não cobre este ponto, atualizar.

## Referências
- [MultiAuthService.ts:17-34](../../worker-functions/src/infrastructure/services/MultiAuthService.ts#L17-L34) — inicialização problemática
- [CLAUDE.md](../../worker-functions/CLAUDE.md) — regra "Testes E2E obrigatório"
- [docs/E2E_INFRA_ANALYSIS.md](../E2E_INFRA_ANALYSIS.md) — análise de infra E2E existente
