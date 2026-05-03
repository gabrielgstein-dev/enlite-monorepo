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

### Testes Visuais (OBRIGATÓRIO)
- **Todo teste que envolva frontend DEVE incluir validação visual via screenshot do Playwright.**
- Usar `await expect(page).toHaveScreenshot()` ou `await expect(locator).toHaveScreenshot()` para capturar e comparar screenshots.
- O objetivo é **garantir que a mudança visual foi aplicada corretamente** e detectar regressões visuais.
- Screenshots de referência ficam em `e2e/screenshots/` ou no diretório padrão do Playwright (`__screenshots__`).
- Ao criar/modificar componentes ou páginas, o teste E2E correspondente **deve** incluir pelo menos um screenshot assertion que valide o estado visual final.
- Testes sem validação visual serão considerados **incompletos**.

### Internacionalização (i18n)
- **Prioridade de idioma**: Espanhol argentino (es-AR). Todas as labels de UI devem estar em espanhol argentino como idioma principal.
- **Nunca** usar texto hardcoded em componentes. Sempre usar chaves i18n via `useTranslation()` de `react-i18next`.
- Traduções ficam em `src/infrastructure/i18n/locales/es.json` (espanhol) e `pt-BR.json` (português).
- Formatação de datas/números: usar locale `es-AR` como padrão (não `pt-BR`).
- Ao criar novas telas ou componentes, **sempre** usar chaves i18n desde o início.
- Estrutura de chaves: agrupar por feature/página (ex: `admin.vacancyDetail.statusCard.title`).

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
| `pnpm test:e2e` | Todos os testes E2E (Playwright) |
| `pnpm test:e2e:integration` | Apenas testes de integração (tag @integration) |
| `pnpm test:e2e:no-integration` | Apenas testes mockados (exclui @integration) |
| `pnpm lint` | ESLint |
| `pnpm type-check` | TypeScript check |
| `pnpm validate:lines` | Validar limite de linhas |
| `pnpm validate:architecture` | Validar imports da arquitetura |

---

## Testes de integração (full stack)

Os testes em `e2e/integration/` exercitam o stack completo: frontend real + backend real + Postgres real.
Estão marcados com `@integration` no `test.describe(...)` para rodar seletivamente.

### Pré-condições

1. **Docker stack do backend rodando:**
   ```bash
   cd worker-functions
   docker compose -f docker-compose.yml -f docker-compose.test.yml up -d postgres api
   ```
2. **Frontend dev server** em outro terminal:
   ```bash
   cd enlite-frontend && pnpm dev
   ```
3. **Firebase Emulator** (opcional — se não estiver rodando, auth usa fallback com token mock fixo):
   ```bash
   cd worker-functions
   docker compose -f docker-compose.yml -f docker-compose.test.yml -f docker-compose.firebase.yml up -d firebase-emulator
   ```
4. **AI keys** (opcional): sem `GEMINI_API_KEY` no container Docker de test, o endpoint
   `/generate-ai-content` é automaticamente mockado via `page.route()` com fixture realista.

### Executar

```bash
cd enlite-frontend
pnpm test:e2e:integration
```

### Estratégia de auth

O backend corre em `USE_MOCK_AUTH=true`. Os testes interceptam TODAS as chamadas à API
e trocam o Authorization header pelo token `mock_<base64>`, exceto:
- `/api/admin/auth/profile` — respondido diretamente pelo test (mock inline)
- `/generate-ai-content` — mockado com fixture
- `/publish-talentum` — sempre mockado para não criar registros reais no Talentum

### Arquivos relevantes

- `e2e/integration/full-create-vacancy.integration.e2e.ts` — happy path completo
- `e2e/integration/admission-patient-flow.integration.e2e.ts` — ADMISSION + criar endereço inline
- `e2e/helpers/db-test-helper.ts` — helpers de setup/cleanup direto no DB via `docker exec`
