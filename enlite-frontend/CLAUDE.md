# Enlite Frontend — Guia para Claude

> Painel administrativo da Enlite para gestão de ATs, vagas, pacientes e operação diária.

---

## Stack Técnico

- **Framework**: React 18 + TypeScript strict
- **Build**: Vite 5
- **Estilo**: Tailwind CSS 3.4
- **Estado**: Zustand
- **Formulários**: React Hook Form + Zod
- **Auth**: Firebase Auth + Google OAuth
- **i18n**: i18next (PT-BR / ES)
- **Testes unitários**: Vitest + Testing Library
- **Testes E2E**: Playwright
- **Package manager**: pnpm 8+

---

## Arquitetura (Clean Architecture)

```
src/
  domain/          → entidades, interfaces, tipos de negócio
  application/     → use cases, lógica de orquestração
  infrastructure/  → API clients, Firebase, serviços externos
  presentation/    → pages, components, layouts (UI)
  hooks/           → React hooks compartilhados
  types/           → tipos globais TypeScript
  styles/          → CSS global e Tailwind config
  test/            → helpers e mocks de teste
  assets/          → imagens, ícones
```

---

## Regras Críticas

### Componentes e Páginas
- **Máximo 400 linhas por arquivo**. Acima disso, extrair subcomponentes.
- Pages só orquestram — lógica de negócio fica em use cases (`application/`).
- Componentes não fazem chamadas HTTP direto. Usam hooks que delegam a `infrastructure/`.

### Estado e Dados
- **Zustand** para estado global. Nunca prop drilling além de 2 níveis.
- Tipos de API e entidades ficam em `domain/`. Nunca definir tipos inline.
- Validação de formulários com **Zod schemas** em `domain/` ou co-locados com o formulário.

### Integração com Backend
- API clients ficam em `infrastructure/`. Um client por domínio (workers, jobs, encuadres, etc.).
- Sempre tipar responses com interfaces de `domain/`.
- Tratamento de erro centralizado no client, não nos componentes.

### Testes
- Testes unitários: `*.test.ts(x)` co-locados com o arquivo testado.
- Testes E2E: `e2e/` na raiz do projeto.
- Scripts de validação: `pnpm validate:lines` (limite de linhas) e `pnpm validate:architecture` (imports corretos).

### Estilo
- Usar classes Tailwind. Evitar CSS custom exceto em `styles/`.
- Ícones via `lucide-react`.
- Responsividade obrigatória (mobile-first).

---

## Comandos Úteis

| Comando | Uso |
|---|---|
| `pnpm dev` | Dev server local |
| `pnpm build` | Build de produção (tsc + vite) |
| `pnpm test` | Testes unitários (vitest watch) |
| `pnpm test:run` | Testes unitários (single run) |
| `pnpm test:e2e` | Testes E2E (Playwright) |
| `pnpm lint` | ESLint |
| `pnpm type-check` | TypeScript check |
| `pnpm validate:lines` | Validar limite de linhas |
| `pnpm validate:architecture` | Validar imports da arquitetura |
