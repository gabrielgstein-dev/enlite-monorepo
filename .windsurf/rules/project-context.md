---
trigger: always_on
---

No início de QUALQUER tarefa, leia os seguintes arquivos nesta ordem:

1. `ia/PROJECT_CONTEXT.md` — arquitetura, stack, estrutura de pastas
2. `ia/DECISIONS.md` — decisões técnicas já tomadas (não reinvente)
3. `ia/CONVENTIONS.md` — padrões de nomenclatura e estrutura do projeto

Antes de criar qualquer arquivo, módulo ou feature, confirme que:
- Não existe implementação equivalente no codebase
- A decisão não contradiz nenhuma entrada em DECISIONS.md
- A estrutura respeita o PROJECT_CONTEXT.md

Se descobrir algo que deveria estar documentado e não está,
atualize o arquivo correspondente ao final da tarefa.