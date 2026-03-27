# Skill: E2E Self-Healing & Repair

## Contexto
Esta skill deve ser ativada sempre que houver falhas nos testes E2E do projeto Worker Functions. O objetivo é garantir que o ambiente local (Docker) esteja íntegro e que os bugs conhecidos do roadmap não retornem.

## Diretrizes de Segurança
- **Proibição de Produção:** Nunca execute requisições para URLs terminadas em `southamerica-west1.run.app`. Se encontrar essa URL em testes, altere para `process.env.API_URL` imediatamente (BUG-07).

## Protocolo de Reparo (ReAct)
Sempre que um comando de teste falhar:
1. **Análise de Logs:** Leia os logs do container `api` e o output do Jest.
2. **Checagem de Infraestrutura:** - Verifique se a DATABASE_URL aponta para a porta 5432 (e não 5433).
   - Verifique se a API_URL aponta para 8080 (e não 8081).
3. **Correção Automática:**
   - Se o erro for 404 em Auth, corrija para `/api/test/auth/token` (BUG-01).
   - Se o erro for 400 em Auth, garanta que o payload tenha `uid`, `email` e `role` (BUG-02).
4. **Verificação:** Re-execute o teste e confirme o "Verde".

## Comandos Úteis
- `npm run test:e2e`
- `docker compose logs api`