---
trigger: glob
globs: **/*.ts, **/*.tsx
---

TypeScript estrito — sem exceções:

- `any` é proibido. Use `unknown` + type guard se necessário
- Todas as funções têm tipos de retorno explícitos
- Interfaces para objetos de domínio, types para unions/utilitários
- Enums apenas quando os valores têm significado de domínio real
- Generics com nomes descritivos: `TEntity`, não apenas `T`
- Nullability explícita: `string | null`, nunca assuma não-nulo
- Sem `!` (non-null assertion) sem comentário justificando

Antes de criar um novo tipo/interface, verifique se já existe
em `src/types/` ou no domínio correspondente.