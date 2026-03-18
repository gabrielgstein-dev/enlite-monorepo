---
trigger: always_on
---

Segurança não é opcional — especialmente em contexto de saúde (LGPD/HIPAA):

- Nunca logar dados de pacientes, CPF, diagnósticos ou tokens
- Validação de entrada em TODAS as bordas (controllers, queue consumers)
- Variáveis de ambiente para todo segredo — nunca hardcoded
- DTOs de saída nunca expõem campos internos do domínio
- Queries parametrizadas sempre — nunca interpolação de string em SQL
- Rate limiting e autenticação verificados antes de implementar qualquer endpoint
- Dados sensíveis em transit: HTTPS obrigatório, nunca HTTP interno sem justificativa

Se a tarefa envolve dados de pacientes ou dados clínicos,
pergunte explicitamente sobre o nível de sensibilidade antes de implementar.
```

---

## Os 4 documentos vivos

Esses são os arquivos que a IA lê E atualiza. Você começa com um template e a própria IA vai enriquecendo conforme o projeto evolui.

**`PROJECT_CONTEXT.md`** — descreve a stack, estrutura de pastas, módulos existentes e como o projeto está organizado. A IA lê isso e nunca mais "esquece" que o projeto é multi-tenant ou que usa NestJS com FHIR R4.

**`ROADMAP.md`** — lista de épicos e tarefas com status (`[ ]` pendente, `[x]` concluído, `[~]` em progresso). A IA marca o que completa.

**`DECISIONS.md`** — registro de decisões técnicas com data e justificativa. Ex: *"2025-03-18: escolhemos Zustand ao invés de Redux porque..."*. Impede a IA de propor trocar algo que já foi decidido.

**`CONVENTIONS.md`** — padrões específicos do projeto: como nomear arquivos, como estruturar hooks, qual pattern usar para cada camada.

---

## O resultado prático

Com esse sistema montado, o fluxo de qualquer sessão nova fica:
```
Nova sessão no Windsurf
  ↓
Cascade lê automaticamente (always_on):
  PROJECT_CONTEXT → sabe o que é o projeto
  ROADMAP         → sabe onde está no progresso
  DECISIONS       → não contradiz o que foi decidido
  ↓
Implementa respeitando:
  Atomic Design + Clean Code + TS Strict + Security
  ↓
Ao concluir:
  Atualiza ROADMAP + DECISIONS se necessário