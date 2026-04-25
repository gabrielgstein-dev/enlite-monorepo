# Improve 006 — Detecção de locale via URL e localStorage no i18n

## Status
Implementado em abril/2026.

## Localização
`enlite-frontend/src/infrastructure/i18n/config.ts`

## Problema

`config.ts` tinha `lng: 'es'` hardcoded, sem nenhum mecanismo de detecção.
Isso quebrou o teste visual do PatientDetailPage:

- O design no Figma é em **português brasileiro** (idioma de design review).
- A produção roda em **espanhol argentino** (idioma do usuário final).
- Tentar comparar screenshot da implementação (es) contra Figma (pt-BR)
  falhava em todas as assertions de texto.

`addInitScript(() => localStorage.setItem('i18nextLng', 'pt-BR'))` no teste
não funcionava porque o config nem lia localStorage.

## Solução

Adicionada função `detectInitialLng()` que checa, em ordem:

1. URL query param `?lng=es` ou `?lng=pt-BR`.
2. `localStorage['i18nextLng']`.
3. Fallback para `'es'` (default mantido — comportamento de produção
   não muda).

Lista de idiomas suportados é whitelist (`['es', 'pt-BR']`) — qualquer valor
fora disso é ignorado e cai para o default.

```ts
function detectInitialLng(): SupportedLng {
  if (typeof window === 'undefined') return 'es';
  try {
    const fromQuery = new URL(window.location.href).searchParams.get('lng');
    if (fromQuery && (SUPPORTED as readonly string[]).includes(fromQuery)) {
      return fromQuery as SupportedLng;
    }
    const fromStorage = window.localStorage?.getItem('i18nextLng');
    if (fromStorage && (SUPPORTED as readonly string[]).includes(fromStorage)) {
      return fromStorage as SupportedLng;
    }
  } catch {
    // SSR ou iframe sem storage — segue pro default.
  }
  return 'es';
}
```

## Por que essa solução é segura

- **Default não muda**: produção continua em `es-AR` para todos os usuários
  reais.
- **Whitelist**: query param malicioso não consegue forçar um locale
  inexistente (o app cairia no fallback `es` mesmo se o param fosse `'jp'`).
- **No-op em SSR / contextos sem `window`**: try/catch protege contra
  crashes em testes que rodam fora do DOM.
- **Sem nova dep**: não usa `i18next-browser-languagedetector` — código
  mínimo direto na config.

## Side effect: query param vira feature

Devs/stakeholders podem testar pt-BR em produção via
`https://app.enlite.health/?lng=pt-BR`. Útil para QA visual e para
designers conferirem traduções sem entrar no código.

## Por que não usar `i18next-browser-languagedetector`

- 18kb a mais no bundle por uma feature que cabe em 12 linhas.
- Detecta nav.language por padrão, o que **mudaria** o idioma para devs em
  máquinas com sistema em inglês ou português — comportamento indesejado
  para uma plataforma cujo idioma alvo é es-AR.
- Custom precedence (URL → storage → fallback) é trivial de escrever
  manualmente; a lib adiciona configuração inútil pro caso.

## Critério de aceite

- [x] Default em produção continua `es`.
- [x] `?lng=pt-BR` força português brasileiro.
- [x] `localStorage['i18nextLng']='pt-BR'` antes do mount → carrega pt-BR.
- [x] Valor inválido em query/storage → ignora, default.
- [x] Type-check sem warnings.
- [x] Testes visuais Figma diff passam com locale forçado.

## Referências

- i18next docs: https://www.i18next.com/overview/configuration-options
- Discussão `feedback_visual_tests_required`: testes visuais frontend exigem
  o idioma do design para diff fiel.
