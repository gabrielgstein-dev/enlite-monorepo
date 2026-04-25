# Improve 005 — Comunicação assíncrona Claude ↔ Gabriel via Telegram

## Status
Implementado em abril/2026. Pareou com a Fase 1 da PatientDetailPage para
permitir trabalho autônomo do Claude com o dev offline.

## Localização
- Bot Telegram: `@ClaudeAsker_bot` (privado, do Gabriel)
- Token + chat_id: `.env.local` na raiz do monorepo (gitignored)
- Scripts: `scripts/ask-telegram.sh`, `scripts/wait-for-telegram-reply.sh`

## Problema

Sessões longas do Claude Code (3-8h) frequentemente coincidem com momentos
em que o dev precisa sair (almoçar, reunião, dormir). Antes, três cenários
ruins:

1. **Claude trava em hard blocker** com o dev offline → fica idle até o dev
   voltar e ler o que aconteceu, perdendo horas.
2. **Claude termina mais cedo** que o esperado → o dev só percebe quando
   abre o terminal de novo, atrasando o ciclo.
3. **Claude faz suposições erradas** quando precisaria perguntar → bug
   chega ao commit, depois precisa ser refeito.

Saída útil seria um canal "ping no celular" que notifica o dev e (idealmente)
permite respostas curtas, sem precisar abrir laptop.

## Solução

### Saída (Claude → Gabriel) — sempre funciona

`scripts/ask-telegram.sh "mensagem com markdown"` envia para o bot pelo
endpoint `sendMessage` da Bot API. Markdown básico (`*bold*`, `_italic_`,
listas) funciona.

```bash
./scripts/ask-telegram.sh "✅ *Commit X done.* Próximo: Y"
echo "milestone Z" | ./scripts/ask-telegram.sh
```

### Entrada (Gabriel → Claude) — funciona apenas durante uma execução

`scripts/wait-for-telegram-reply.sh --timeout 600 --poll-interval 5`
faz long-polling em `getUpdates` até receber mensagem do `chat_id`
configurado, com offset persistido em `/tmp/telegram-last-update-id-<hash>.txt`
para não reler mensagens já consumidas.

```bash
./scripts/ask-telegram.sh "Devo continuar com Y ou pular para Z?"
ANSWER="$(./scripts/wait-for-telegram-reply.sh --timeout 600)"
case "$ANSWER" in
  Y*) ... ;;
  Z*) ... ;;
esac
```

### Setup (uma vez)

1. `@BotFather` no Telegram → `/newbot` → recebe token (`8663…AAFq…`).
2. Dev manda mensagem qualquer pro bot (Telegram não permite que bots
   iniciem conversas sem o usuário "abrir" antes).
3. Claude faz `curl getUpdates` uma vez → captura `chat.id` (numérico).
4. Token + chat_id em `.env.local`:
   ```
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_CHAT_ID=...
   ```
5. `.gitignore` cobre `.env.local` (verificado).

## Limitações honestas

| Limitação | Workaround atual |
|-----------|------------------|
| Claude só recebe mensagens **enquanto está rodando**. Se o dev fecha o terminal, mensagens ficam em fila e só são lidas na próxima sessão. | Usar `ScheduleWakeup` para "voltar daqui a X minutos" ou pedir ao dev para deixar o Claude Code aberto durante longos trabalhos autônomos. |
| Sem suporte a anexos (imagens, PDFs) — só texto. | OK para perguntas curtas; screenshots ainda saem por outros canais (Slack, prints manuais). |
| Polling consome 1 req/5s (default). Em janela de 10 min, ~120 reqs. Bot API não tem rate limit problemático para esse volume. | — |
| Token "secreto" mas não particularmente sensível: bot só pode mandar mensagens pra **um** chat_id pre-autorizado. Se vazar, o pior cenário é spam pessoal. | Revoga via BotFather a qualquer momento. |

## Por que Telegram e não Slack/Discord/SMS

- **Telegram**: API trivial (HTTP + JSON), bot setup em 30s, app tem
  notificação push agressiva, dev usa diariamente.
- **Slack**: requer workspace + scopes OAuth + app aprovado; overkill.
- **Discord**: similar overhead, push notifications menos confiáveis.
- **SMS**: caro (Twilio), latência alta, sem markdown.
- **Email**: sem push em tempo real.

## Critério de aceite

- [x] Token+chat_id no `.env.local`, gitignored.
- [x] `scripts/ask-telegram.sh` envia mensagem com sucesso.
- [x] `scripts/wait-for-telegram-reply.sh` retorna resposta dentro do timeout.
- [x] Polling não relê mensagens já consumidas (offset persistido).
- [x] Quebra clara quando token ou chat_id estão ausentes.

## Padrão de uso recomendado

```bash
# Dentro de um agente longo:
./scripts/ask-telegram.sh "🔄 Status: 2/4 commits feitos. Próximo: tab X"

# Quando precisar decisão:
./scripts/ask-telegram.sh "❓ Devo $A ou $B? Responde com A ou B"
ANSWER="$(./scripts/wait-for-telegram-reply.sh --timeout 1200)"
# Continua baseado em $ANSWER

# Quando termina:
./scripts/ask-telegram.sh "✅ Tudo feito. Push em $COMMIT_RANGE."
```

## Referências

- Bot API docs: https://core.telegram.org/bots/api
- BotFather: https://t.me/BotFather
