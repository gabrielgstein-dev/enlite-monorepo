# Improve 007 — Race condition no Firebase auth state em hard navigations

## Status
Implementado em abril/2026 durante a Fase 1 do PatientDetailPage.

## Localização
`enlite-frontend/src/infrastructure/services/FirebaseAuthService.ts` —
método `getIdToken()`.

## Problema

Em **hard navigations** para páginas autenticadas (ex: usuário cola
diretamente `https://app.enlite.health/admin/patients/<uuid>`), o React
monta a árvore antes que o Firebase SDK termine de hidratar o auth state
do `localStorage`. Sequência típica:

```
t=0ms   Browser carrega index.html
t=20ms  React monta App, renderiza <PatientDetailPage>
t=25ms  usePatientDetail useEffect dispara fetch
t=30ms  AdminApiService.getIdToken() ────► auth.currentUser === null
                                          ────► retorna null
t=35ms  fetch GET /api/admin/patients/:id  SEM Authorization header
t=40ms  ❌ Backend: 401 "Authorization header required"
t=80ms  Firebase SDK termina onAuthStateChanged → currentUser definido
        (mas a chamada já falhou e o componente já está em estado de erro)
```

Sintoma observado: integration test ficava verde quando o usuário **vinha
da listagem** (auth já tinha sido lida na navegação anterior) mas vermelho
quando navegava direto.

## Solução

`getIdToken()` agora espera explicitamente pelo `onAuthStateChanged`
quando `currentUser` ainda é null, com timeout de 2s:

```ts
async getIdToken(): Promise<string | null> {
  const auth = getFirebaseAuth();
  let currentUser = auth.currentUser;
  if (!currentUser) {
    currentUser = await this.waitForAuthReady(2000);
  }
  if (!currentUser) {
    return null;
  }
  return getIdToken(currentUser);
}

private waitForAuthReady(timeoutMs: number): Promise<FirebaseUser | null> {
  const auth = getFirebaseAuth();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(auth.currentUser);
    }, timeoutMs);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        clearTimeout(timer);
        unsubscribe();
        resolve(user);
      }
    });
  });
}
```

Comportamento:

- **Caso comum** (`currentUser` já hidratado): retorna imediatamente, sem
  custo extra.
- **Race em hard navigation**: aguarda até 2s pelo SDK terminar a
  hidratação. Se o usuário tem credencial válida no localStorage, vai
  resolver em <100ms.
- **Usuário deslogado**: o callback `onAuthStateChanged` dispara com
  `user=null` (não entra no `if (user)`), o timer expira em 2s e
  retorna `null` → request sai sem Authorization e o backend rejeita
  apropriadamente. Igual ao comportamento anterior, só com 2s extras
  no caminho errado (aceitável — caminho de exceção).

## Critério de aceite

- [x] Integration E2E test (`admin-patient-detail-integration.e2e.ts`)
      passa em hard navigation para `/admin/patients/<id>`.
- [x] Demais consumidores de `getIdToken()` (worker detail, listas) não
      regrediram — race era subaproveitada porque eles geralmente vêm de
      outra rota autenticada.
- [x] Testes unit existentes do `FirebaseAuthService` (28 tests) seguem
      passando.

## Por que 2s e não 5s ou 10s

- 2s cobre o p99 da hidratação do SDK Firebase em hardware modesto +
  conexão lenta (medido empiricamente em testes de reload).
- > 2s degrada percepção de carregamento na primeira tela autenticada
  (usuário vê skeleton parado).
- Caso o SDK realmente esteja com falha (ex: emulator offline), os 2s não
  resolvem o problema — apenas adiam o erro. Aceitável: erro de
  infraestrutura é raro e a mensagem 401 vai aparecer com 2s de atraso.

## Por que não inicializar antes de renderizar a árvore

Alternativa "limpa": esperar `onAuthStateChanged` no `App.tsx` antes de
montar `<RouterProvider>`. Custo:

- Mostra um spinner global em **toda navegação inicial**, não só nas
  autenticadas — degrada a tela de login pública.
- Requer refactor maior (mover bootstrap pra `main.tsx` ou usar Suspense).

A solução escolhida é localizada: o problema é só na chamada de API que
precisa de token. O custo é assumido apenas quando o token é
efetivamente solicitado.

## Referências

- Firebase docs: https://firebase.google.com/docs/auth/web/manage-users#get_the_currently_signed-in_user
- Memória `feedback_e2e_must_run_before_commit`: integração docker é
  pré-condição de commit. Sem este fix, integration test ficaria
  permanentemente vermelho.
