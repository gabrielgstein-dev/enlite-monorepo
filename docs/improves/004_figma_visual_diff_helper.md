# Improve 004 — Helper de visual diff side-by-side com Figma

## Status
Implementado em abril/2026 durante a Fase 1 da [PatientDetailPage](../features/patient-detail-page.md).

## Localização
- Helper: `enlite-frontend/e2e/helpers/figma-visual-diff.ts`
- Fetch script: `enlite-frontend/e2e/helpers/fetch-figma-reference.ts`
- Fixtures: `enlite-frontend/e2e/fixtures/figma/<nodeId>.png`
- Script npm: `pnpm test:figma:fetch <nodeId>...`

## Problema

O Playwright já tinha `toHaveScreenshot()` para regressão visual, mas ele
compara contra um baseline gerado pela própria implementação — não detecta
"divergiu do design". Quando o time desenha algo novo no Figma e o frontend
implementa, não havia gate automatizado dizendo "isso bate visualmente com o
que o designer fez".

A revisão lado-a-lado era manual: imprimir tela, comparar com Figma, julgar
no olho. Cansativo, subjetivo e não escalável quando temos 18+ telas em fila.

## Solução

Helper TypeScript que:

1. Lê PNG do Figma cacheado em `e2e/fixtures/figma/<nodeId>.png`
2. Tira screenshot do Playwright (page ou locator)
3. Normaliza ambos para o mesmo bounding box
4. Diff via `pixelmatch` com threshold configurável
5. Salva 3 PNGs em caso de falha (`actual`, `expected`, `diff`)

API:

```ts
import { expectMatchesFigma } from './helpers/figma-visual-diff';

await expectMatchesFigma(page, '6390:13184', {
  fullPage: true,
  maxDiffRatio: 0.15,    // 0–1, % de pixels podendo divergir
  pixelThreshold: 0.2,    // YIQ color tolerance, 0–1
  includeAA: true,        // ignorar anti-aliasing
});
```

Aceita `Page` ou `Locator` — para componentes isolados é só passar
`page.getByTestId('familiares-card')`.

### Fetch das references

`pnpm test:figma:fetch <nodeId>...` baixa via Figma REST API:

```bash
FIGMA_API_TOKEN=fig_xxxx FIGMA_SCALE=2 pnpm test:figma:fetch \
  6390:13184 5808:13866 5764:49894 6429:12461
```

`scale=2` produz PNGs em ~2880×4754 (resolução boa). Sem scale ou via Figma
MCP renderiza em 621×1024, o que infla artificialmente o diff por causa de
upscaling/anti-aliasing.

`FIGMA_API_TOKEN` é gerado em
[figma.com/developers/api#access-tokens](https://www.figma.com/developers/api#access-tokens)
com escopo "File content: read". Vai em `.env.local` (gitignored).

## Limitações conhecidas

1. **Fontes**: Poppins e Lexend (do design system Enlite) precisam ser
   pré-carregadas no Playwright via `@font-face` ou import — caso contrário
   o fallback system-default introduz ~12% de diff por subpixel rendering.
   Hoje o threshold pragmatic é 0.15; com fontes carregadas dá pra ir a 0.05.
2. **Conteúdo dinâmico**: a implementação precisa renderizar com **dados
   idênticos** ao Figma (mock da API ou props determinísticos). Caso
   contrário o diff falha por divergência de texto, não de design.
3. **Estados interativos**: hover/focus/animations não são capturados em
   screenshot estático — para isso continua valendo testes funcionais.
4. **Resize lossy**: quando dimensões do screenshot e do Figma diferem
   muito, o helper resize ambos para o mínimo comum via nearest-neighbor.
   Isso é suficiente para regressão estrutural, ruim para fidelidade fina.

## Por que `pixelmatch` e não `odiff` ou `looks-same`

- `pixelmatch`: 150 linhas, sem deps nativas, já é o que o Playwright usa
  internamente. Suficiente para imagens até ~5M pixels.
- `odiff`: SIMD em Zig, 6× mais rápido. Vale migrar se rodarmos visual diff
  em CI com >50 telas. Por enquanto pixelmatch é mais simples.
- `looks-same`: bloqueia event loop em contextos paralelos do Playwright,
  causa flakes. Evitar.
- `resemble.js`: overhead pesado, comparação perceptual desnecessária para
  nosso caso.

## Convenções

- nodeId no nome do arquivo: `:` ou `-` viram `_` (sistema de arquivos).
  Ex: `6390:13184` → `6390_13184.png`.
- Threshold default: 0.025 (estrito) para componentes; usar 0.15 para
  full-page até as fontes serem carregadas.
- Ao falhar, os artefatos `*.actual.png` / `*.expected.png` / `*.diff.png`
  são salvos no diretório da fixture e estão **gitignored** (não poluir
  histórico).

## Critério de aceite

- [x] Helper compila com type-check sem erros
- [x] Fetch script funciona com `FIGMA_API_TOKEN` válido
- [x] References das 4 telas de paciente estão cacheadas
- [x] 4 testes visuais (1 por tab) passam em chromium + firefox + webkit
- [x] CI integration: `pnpm test:e2e admin-patient-detail-visual` em <30s

## Próximas iterações

1. **Carregar fontes Poppins/Lexend no Playwright** para dropar threshold
   para 0.05.
2. **Visual diff por componente** (em vez de full-page) — mais preciso e
   evita falsa regressão quando uma seção da página muda mas o componente
   testado fica intacto.
3. **CI gate**: tornar o teste visual obrigatório no `frontend-ci-cd.yml`
   (hoje só roda local).
4. **Batch fetch**: comando que lê todos os nodeIds usados nos testes e
   atualiza fixtures em uma chamada (evita `pnpm test:figma:fetch a b c d`
   manual a cada redesign).

## Referências

- Helper: [`enlite-frontend/e2e/helpers/figma-visual-diff.ts`](../../enlite-frontend/e2e/helpers/figma-visual-diff.ts)
- Fetch script: [`enlite-frontend/e2e/helpers/fetch-figma-reference.ts`](../../enlite-frontend/e2e/helpers/fetch-figma-reference.ts)
- pixelmatch: https://github.com/mapbox/pixelmatch
- Figma REST images endpoint: https://www.figma.com/developers/api#get-images-endpoint
