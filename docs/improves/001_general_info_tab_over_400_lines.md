# Improve 001 — `GeneralInfoTab.tsx` excede limite de 400 linhas

## Status
Aberto. Regressão pré-existente identificada durante QA da feature de admin users (branch `feature/workers-export`, abril/2026).

## Localização
`enlite-frontend/src/presentation/pages/tabs/GeneralInfoTab.tsx` — **579 linhas**.

## Problema
O arquivo está 45% acima do limite de **400 linhas** estabelecido como regra universal no [CLAUDE.md](../../CLAUDE.md) e reforçado em [enlite-frontend/CLAUDE.md](../../enlite-frontend/CLAUDE.md):

> **Máximo 400 linhas por arquivo**. Acima disso, extrair subcomponentes.

O comando `pnpm validate:lines` falha por causa desse único arquivo, mascarando regressões futuras: qualquer novo arquivo que ultrapasse 400 linhas entra "junto" na falha e passa despercebido até alguém investigar manualmente.

## Por que precisamos arrumar

1. **Validação silenciada**: enquanto esse arquivo existir acima do limite, `pnpm validate:lines` fica vermelho permanentemente. O script vira ruído que as pessoas ignoram, em vez de um gate efetivo contra arquivos grandes.
2. **CI/CD**: se o `validate:lines` for (ou já for) parte da pipeline de CI, builds estão passando com warning ou falhando pela mesma causa — ambos cenários erodem a confiança no check.
3. **Manutenibilidade**: páginas de aba de 579 linhas misturam várias responsabilidades (formulário, validação, fetch, submit, UI condicional). Qualquer dev novo que precisar mexer aqui vai sofrer pra localizar o que precisa alterar.
4. **Precedente**: deixar um arquivo conhecido violando a regra é um sinal implícito ao time de que "a regra não vale" — outros devs vão extrapolar em mais arquivos.

## Sinais de que o refactor é seguro
- O arquivo é uma aba dentro de uma página de detalhe (pattern conhecido), então a extração de subcomponentes segue o padrão já utilizado em outras abas (`ReportsTab`, `DocumentsTab`, etc. — procurar referências).
- Existem testes unitários/E2E que cobrem essa aba (validar em `__tests__/` co-locado e em `e2e/`).

## Proposta de correção

1. **Ler** o arquivo e identificar agrupamentos lógicos: tipicamente seções de formulário, blocos de campos read-only, painéis colapsáveis, modais internos.
2. **Extrair** em subcomponentes puros em `src/presentation/components/worker-detail/` (ou pasta análoga). Sugestões iniciais:
   - `GeneralInfoPersonalSection.tsx` — dados pessoais (nome, doc, contato)
   - `GeneralInfoAddressSection.tsx` — endereço + zoneamento
   - `GeneralInfoProfessionalSection.tsx` — ocupação, formação, experiência
   - `GeneralInfoBankSection.tsx` — dados bancários/MEI (se existir)
3. **Manter a page** `GeneralInfoTab.tsx` como orquestradora: state + submit + renderização dos subcomponentes.
4. **Preservar testes existentes** — se um teste quebrar porque dependia de DOM interno específico, refatorar o teste pra usar `screen.getByRole/getByLabelText` em vez de classes CSS/estruturas frágeis.

## Critérios de aceite
- `GeneralInfoTab.tsx` ≤ 400 linhas.
- Cada subcomponente extraído ≤ 400 linhas.
- `pnpm type-check`, `pnpm lint`, `pnpm validate:architecture`, `pnpm validate:lines`, `pnpm test:run`, `pnpm build` todos passando.
- Teste E2E da aba General Info (se existir) continua passando com screenshot válido.
- Nenhuma mudança visual perceptível — refactor é estrutural, não cosmético.

## Esforço estimado
**Médio** — 2 a 4 horas. A maior parte é mecânica (extrair JSX + passar props), mas precisa cuidado com estado compartilhado entre seções do formulário.

## Prioridade
**Média**. Não bloqueia feature nenhuma, mas deveria entrar no próximo ciclo de manutenção técnica. Quanto mais tempo o arquivo ficar acima do limite, mais lógica tende a ser empilhada nele ("já está grande mesmo").

## Referências
- [CLAUDE.md](../../CLAUDE.md) — regra de 400 linhas
- [enlite-frontend/CLAUDE.md](../../enlite-frontend/CLAUDE.md) — reforço da regra
- [GeneralInfoTab.tsx](../../enlite-frontend/src/presentation/pages/tabs/GeneralInfoTab.tsx)
