# Runbook — Migration 135 (Drop `admins_extension`)

## Contexto

A migration 135 dropou a tabela `admins_extension` e eliminou o fluxo legacy de `must_change_password` (temp password + forçar troca no primeiro login). A partir dessa migration, tanto **criação** quanto **reset** de senha de staff usam invitation link do Firebase (`generatePasswordResetLink`).

## Risco Operacional

Usuários admin criados **antes** da migration 134 podem ter `must_change_password = true` em `admins_extension` — indicando que receberam uma senha temporária e **nunca a trocaram**. Após a migration 135:

- A flag não existe mais (tabela dropada)
- Não há mais redirect forçado para `/admin/change-password` (página deletada)
- Esses usuários podem logar com a senha temporária antiga sem serem forçados a trocar

A senha temporária é fraca (8 caracteres, base64url aleatória) e pode ter sido compartilhada por email/WhatsApp. **Deixar esses usuários com a senha temporária ativa é risco de segurança.**

## Protocolo de Mitigação (obrigatório antes do deploy em `enlite-prd`)

### Passo 1 — Antes do deploy: identificar usuários afetados

Rode no banco de produção **antes** de aplicar a migration 135:

```sql
SELECT
  u.firebase_uid,
  u.email,
  u.display_name,
  ae.last_login_at,
  ae.login_count
FROM users u
JOIN admins_extension ae ON ae.user_id = u.firebase_uid
WHERE ae.must_change_password = true
  AND u.is_active = true;
```

Salve o CSV do resultado. Esses são os usuários que precisam de ação pós-deploy.

> Se `login_count = 0` e `last_login_at IS NULL`, o usuário **nunca logou** — senha temp ainda está ativa.
> Se `login_count > 0` mas `must_change_password` ainda é `true`, alguma coisa impediu o fluxo de troca no passado — investigar caso a caso.

### Passo 2 — Aplicar migration 135

```bash
./scripts/run-migration-prod.sh worker-functions/migrations/135_drop_admins_extension.sql
```

### Passo 3 — Pós-deploy: forçar reset para cada usuário do CSV

Para cada `firebase_uid` do CSV do passo 1, disparar o reset via painel admin:

1. Logar no painel como admin
2. Ir em **Usuários** (`/admin/users`)
3. Localizar cada usuário pelo email
4. Clicar em **Reset** — isso gera novo invitation link Firebase e envia por email + exibe o link no modal fallback
5. Se o email não chegar (usuário reporta), usar o botão **Copiar link** do modal e mandar manualmente via WhatsApp/Slack/canal seguro

### Passo 4 — Comunicação

Enviar mensagem ao time avisando: "Admins criados antes de abril/2026 que nunca tinham trocado a senha temporária foram resetados. Cheque seu email para definir nova senha."

## Rollback (se precisar)

A migration 135 dropa a tabela via `RENAME → DROP`. Não há rollback automático dos dados. Em caso de problema:

1. Não é possível recuperar `access_level`, `permissions`, `must_change_password` dos usuários — esses campos não eram usados em lógica ativa, então a perda é aceitável
2. Para restaurar a tabela vazia: rodar as definições de `CREATE TABLE admins_extension` de `migrations/005_create_future_role_tables.sql` + `016_add_must_change_password.sql`
3. **Nenhum código de aplicação depende mais dessa tabela** — portanto mesmo sem rollback, o sistema continua funcional

## Referências

- [Migration 135](../../worker-functions/migrations/135_drop_admins_extension.sql)
- [CreateAdminUserUseCase](../../worker-functions/src/application/use-cases/CreateAdminUserUseCase.ts) — criação via invitation link
- [ResetAdminPasswordUseCase](../../worker-functions/src/application/use-cases/ResetAdminPasswordUseCase.ts) — reset via invitation link
- [InvitationFallbackModal](../../enlite-frontend/src/presentation/components/admin/InvitationFallbackModal.tsx) — UI de fallback com botão "Copiar link"
