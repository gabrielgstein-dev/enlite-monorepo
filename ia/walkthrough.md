# Worker Registration Flow — Walkthrough

## ✅ TypeScript Check
- **Frontend**: `npx tsc --noEmit` → **zero errors** ✅
- **Backend**: Pre-existing unrelated errors only (missing firebase-admin types, path aliases in unrelated files). **Our changed files compile cleanly** ✅

---

## O que foi implementado

### Backend — worker-functions

| Arquivo | Mudança |
|---|---|
| [migrations/007_add_whatsapp_lgpd_to_workers.sql](file:///Users/gabrielstein-dev/projects/enlite/worker-functions/migrations/007_add_whatsapp_lgpd_to_workers.sql) | **[NOVO]** Adiciona `whatsapp_phone` e `lgpd_consent_at`; torna `phone` opcional |
| [src/domain/entities/Worker.ts](file:///Users/gabrielstein-dev/projects/enlite/worker-functions/src/domain/entities/Worker.ts) | `phone` agora opcional; novos campos `whatsappPhone` e `lgpdConsentAt` em [Worker](file:///Users/gabrielstein-dev/projects/enlite/worker-functions/src/domain/entities/Worker.ts#1-38) e [CreateWorkerDTO](file:///Users/gabrielstein-dev/projects/enlite/worker-functions/src/domain/entities/Worker.ts#41-53) |
| [src/infrastructure/repositories/WorkerRepository.ts](file:///Users/gabrielstein-dev/projects/enlite/worker-functions/src/infrastructure/repositories/WorkerRepository.ts) | [create()](file:///Users/gabrielstein-dev/projects/enlite/worker-functions/src/infrastructure/repositories/WorkerRepository.ts#17-47) insere novos campos; todos os `SELECT` retornam `whatsapp_phone` e `lgpd_consent_at` |
| [src/interfaces/controllers/WorkerControllerV2.ts](file:///Users/gabrielstein-dev/projects/enlite/worker-functions/src/interfaces/controllers/WorkerControllerV2.ts) | [initWorker](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/infrastructure/http/WorkerApiService.ts#87-95): `phone` opcional, aceita `whatsappPhone` + `lgpdOptIn`; retorna worker existente se já criado. [getProgress](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/infrastructure/http/WorkerApiService.ts#96-104): lê authUid de `req.user?.uid` ou header |

---

### Frontend — enlite-frontend

| Arquivo | Mudança |
|---|---|
| [src/infrastructure/http/WorkerApiService.ts](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/infrastructure/http/WorkerApiService.ts) | **[NOVO]** Singleton de API com Firebase JWT automático. Métodos: [initWorker](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/infrastructure/http/WorkerApiService.ts#87-95), [getProgress](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/infrastructure/http/WorkerApiService.ts#96-104), [saveStep](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/infrastructure/http/WorkerApiService.ts#105-112) |
| [src/presentation/hooks/useWorkerApi.ts](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/hooks/useWorkerApi.ts) | **[NOVO]** Hook ergonômico que injeta `user.id` e `user.email` automaticamente |
| [src/presentation/stores/workerRegistrationStore.ts](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/stores/workerRegistrationStore.ts) | Adicionado `workerId`, [setWorkerId](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/stores/workerRegistrationStore.ts#177-180), [hydrateFromServer](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/stores/workerRegistrationStore.ts#181-206), `STEP_NAME_TO_NUMBER`, [getWorkerStorageKey](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/stores/workerRegistrationStore.ts#154-161) (chave per-user) |
| [src/presentation/App.tsx](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/App.tsx) | `/worker-registration` agora envolto em `<ProtectedRoute redirectTo="/login?next=/worker-registration">` |
| [src/presentation/pages/LoginPage.tsx](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/pages/LoginPage.tsx) | [handleSuccess](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/pages/LoginPage.tsx#25-30) agora lê `?next=` e redireciona para o caminho original |
| [src/presentation/pages/WorkerRegistrationPage.tsx](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/pages/WorkerRegistrationPage.tsx) | **Reescrita completa**: auth guard duplo, skeleton enquanto `isLoading`, `GET /api/workers/me` na montagem, `POST /api/workers/init` para novos workers, chave de persist por userId, pre-fill de campos readonly do Firebase user |
| [src/presentation/pages/RegisterPage.tsx](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/pages/RegisterPage.tsx) | Após Google/email register como worker → [initWorker](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/infrastructure/http/WorkerApiService.ts#87-95) → redirect para `/worker-registration` |
| [steps/GeneralInfoStep.tsx](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/components/worker-registration/steps/GeneralInfoStep.tsx) | [onSubmit](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/components/worker-registration/steps/GeneralInfoStep.tsx#73-98) chama [saveStep(workerId, 2, ...)](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/infrastructure/http/WorkerApiService.ts#105-112) antes de avançar; exibe loading/erro |
| [steps/ServiceAddressStep.tsx](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/components/worker-registration/steps/ServiceAddressStep.tsx) | [onSubmit](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/components/worker-registration/steps/GeneralInfoStep.tsx#73-98) chama [saveStep(workerId, 3, ...)](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/infrastructure/http/WorkerApiService.ts#105-112) antes de avançar; exibe loading/erro |
| [steps/AvailabilityStep.tsx](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/components/worker-registration/steps/AvailabilityStep.tsx) | [onSubmit](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/components/worker-registration/steps/GeneralInfoStep.tsx#73-98) chama [saveStep(workerId, 4, ...)](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/infrastructure/http/WorkerApiService.ts#105-112) com mapeamento de dias da semana; exibe loading/erro |

---

## Fluxos Implementados

### 1. Registro como Worker (Google ou Email)
```
/register?type=worker
  → Google Identity / email+senha
  → POST /api/workers/init (com whatsapp + lgpdOptIn)
  → redirect /worker-registration
```

### 2. Proteção da Tela de Wizard
```
Acesso a /worker-registration sem login
  → ProtectedRoute detecta isAuthenticated=false
  → redirect /login?next=/worker-registration
  → login bem-sucedido
  → LoginPage lê ?next= → redirect /worker-registration ✅
```

### 3. Init e Restauração de Progresso
```
WorkerRegistrationPage monta
  → GET /api/workers/me
  → Sucesso: hydrateFromServer() → usuário volta ao step onde parou ✅
  → 404 (worker novo): POST /api/workers/init → step 1 ✅
```

### 4. Salvamento Incremental por Step
```
Usuário clica "Próximo"
  → saveStep(workerId, stepNumber, data) → PUT /api/workers/step
  → Spinner no botão (isSubmitting)
  → Sucesso: goToNextStep()
  → Erro: exibe mensagem, não avança ✅
```

### 5. Persistência Cross-Session (fechou o browser, deslogou)
```
Zustand persist namespaceado por userId → localStorage seguro por usuário
  +
GET /api/workers/me na montagem (fonte da verdade)
  → Rehydrata step + dados mesmo após logout completo ✅
```

---

## Próximos Passos (fora do escopo atual)

- Executar migration [007_add_whatsapp_lgpd_to_workers.sql](file:///Users/gabrielstein-dev/projects/enlite/worker-functions/migrations/007_add_whatsapp_lgpd_to_workers.sql) no banco
- Integrar coordenadas lat/lng reais no [ServiceAddressStep](file:///Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/components/worker-registration/steps/ServiceAddressStep.tsx#15-188) (atualmente `lat: 0, lng: 0`)
- Implementar tela de conclusão do cadastro (após o último step)
- Testar com um ambiente funcionando (backend + Firebase configurado)
