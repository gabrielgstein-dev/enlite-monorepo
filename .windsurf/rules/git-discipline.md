---
trigger: always_on
---

Commits seguem Conventional Commits obrigatoriamente:
feat, fix, refactor, chore, docs, test, style, perf

- Um commit por mudança lógica — nunca agrupe coisas não relacionadas
- Mensagem no imperativo: "add button component", não "added button"
- Nunca commitar: arquivos de build, .env, segredos, node_modules
- Branches: feature/*, fix/*, refactor/*, chore/*

Antes de sugerir um commit, verifique se o escopo está correto
e se a mensagem descreve o *porquê*, não apenas o *quê*.