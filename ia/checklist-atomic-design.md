# ⚛️ ATOMIC DESIGN — CHECKLIST DE IMPLEMENTAÇÃO

> **INSTRUÇÃO PARA A IA:** Este documento é de leitura **OBRIGATÓRIA** antes de criar, reescrever ou refatorar **qualquer** componente, independente do tamanho ou nível hierárquico. Nenhum componente deve ser entregue sem que todos os itens aplicáveis estejam verificados e marcados.

---

## 🔎 FASE 0 — AUDITORIA PRÉVIA (SEMPRE EXECUTAR PRIMEIRO)

Antes de escrever **qualquer linha de código**, a IA deve obrigatoriamente responder a estas perguntas:

- [ ] **Já existe um componente que faz isso (ou algo próximo)?**
  - Varrer os diretórios: `atoms/`, `molecules/`, `organisms/`, `templates/`, `pages/`
  - Buscar por nomes semânticos relacionados à funcionalidade desejada
  - Buscar por props/comportamentos similares em componentes existentes
- [ ] **Se existe: posso reutilizá-lo diretamente?**
  - Sim → Usar o existente. **Não criar duplicata.**
- [ ] **Se existe mas não atende 100%: posso estendê-lo ou parametrizá-lo?**
  - Sim → Refatorar o existente para aceitar a nova variação via props/slots.
  - Não → Justificar por escrito por que um novo componente é necessário.
- [ ] **Se não existe: este componente resolve algo que aparecerá em mais de um lugar?**
  - Sim → Criar como componente compartilhado no nível adequado.
  - Não → Avaliar se deve ser local ao feature/page ou de fato compartilhado.

> ⛔ **REGRA ZERO:** Nunca criar um componente novo sem antes confirmar que não existe um equivalente reutilizável. Duplicação de comportamento é a maior violação do Design Atômico.

---

## 🗂️ FASE 1 — CLASSIFICAÇÃO HIERÁRQUICA

Determinar o nível correto do componente antes de implementar.

### Referência Rápida dos Níveis

| Nível | O que é | Tem estado? | Tem lógica de negócio? | Faz chamadas API? |
|---|---|---|---|---|
| **Atom** | Menor unidade indivisível. Ex: Button, Input, Label, Icon, Badge | ❌ Não (ou estado visual mínimo) | ❌ Nunca | ❌ Nunca |
| **Molecule** | Grupo de atoms formando uma unidade funcional. Ex: SearchField, FormField, NavItem | ⚠️ Estado simples de UI | ❌ Nunca | ⚠️ Raramente |
| **Organism** | Seção complexa e autônoma da UI. Ex: Header, Footer, ProductCard, Form | ✅ Pode ter estado | ⚠️ Mínima | ✅ Pode |
| **Template** | Define a estrutura/layout da página — sem conteúdo real. Ex: BlogLayout, DashboardLayout | ❌ Não | ❌ Nunca | ❌ Nunca |
| **Page** | Template preenchido com conteúdo real e dados reais. Ex: BlogPostPage, ProfilePage | ✅ Orquestra o estado | ✅ Ponto de entrada | ✅ Sim |

### Perguntas para Classificar

- [ ] O componente pode ser quebrado em partes menores que ainda façam sentido sozinhas? → Se **sim**: quebre antes de classificar.
- [ ] O componente funciona de forma isolada, sem depender de contexto externo? → Provavelmente um **Atom** ou **Molecule**.
- [ ] O componente representa uma seção coesa e autônoma da interface? → Provavelmente um **Organism**.
- [ ] O componente organiza regiões de layout sem conteúdo real? → É um **Template**.
- [ ] O componente é uma rota real com dados reais? → É uma **Page**.

---

## ⚙️ FASE 2 — PRINCÍPIOS DE ARQUITETURA

### 2.1 — Fluxo de Dependências (REGRA INVIOLÁVEL)

> A dependência só pode fluir **de cima para baixo** na hierarquia. Nunca o contrário.

- [ ] Atoms **não importam** Molecules, Organisms, Templates ou Pages
- [ ] Molecules **não importam** Organisms, Templates ou Pages
- [ ] Organisms **não importam** Templates ou Pages
- [ ] Templates **não importam** Pages
- [ ] Pages podem importar todos os níveis abaixo

```
Page → Template → Organism → Molecule → Atom
         (dependência só flui nesta direção →)
```

> Se um Atom precisar "saber" de um Organism para funcionar, isso é um **sinal de redesign necessário**.

### 2.2 — Single Responsibility Principle

- [ ] O componente faz **uma única coisa bem feita**
- [ ] O nome do componente descreve exatamente **o que ele faz** (sem ambiguidade)
- [ ] Se o componente precisa de uma conjunção ("e", "&") no nome para ser descrito, provavelmente precisa ser dividido

### 2.3 — Gestão de Estado por Nível

- [ ] **Atoms/Molecules:** Estado restrito à UI local (ex: `isOpen`, `isFocused`, `isHovered`)
- [ ] **Organisms:** Podem possuir estado de domínio (ex: lista de items, form state)
- [ ] **Estado global/compartilhado:** Gerenciado em Organisms ou Pages, passado via props ou Context API
- [ ] **Atoms nunca acessam estado global** diretamente (Redux, Zustand, Context, etc.)

---

## 🎨 FASE 3 — DESIGN E REUTILIZAÇÃO

### 3.1 — Design Tokens

- [ ] Cores usam tokens do design system (ex: `var(--color-primary)` ou variáveis do Tailwind/tema)
- [ ] Espaçamentos usam tokens de spacing (não valores hardcoded como `margin: 13px`)
- [ ] Tipografia usa tokens (não `font-size: 17px` livre)
- [ ] Border-radius, sombras e breakpoints seguem os tokens definidos

### 3.2 — Reusabilidade e Generidade

- [ ] O componente foi projetado para funcionar em **múltiplos contextos**, não apenas no atual
- [ ] Conteúdo específico de contexto é passado via **props ou slots** (não hardcoded)
- [ ] O componente **não assume** em qual página ou feature ele será usado
- [ ] Se o componente tem um nome específico de domínio (ex: `PatientCard`), verificar se uma versão genérica (`Card`) já existe ou deveria existir

### 3.3 — Variações e Estados

- [ ] Todos os estados visuais foram implementados: `default`, `hover`, `focus`, `active`, `disabled`, `loading`, `error`
- [ ] Variações de tamanho (se aplicável): `sm`, `md`, `lg`
- [ ] Variações de tema/aparência (se aplicável): `primary`, `secondary`, `danger`, `ghost`
- [ ] Comportamento com conteúdo extremo foi considerado: texto muito longo, lista vazia, muitos itens

### 3.4 — Margens e Espaçamento Externo

- [ ] O componente **NÃO define sua própria margem externa** (`margin`, `margin-top`, etc.)
- [ ] Margens externas são responsabilidade do **componente pai** (via `gap`, `padding` no container, ou classe utilitária passada como prop)
- [ ] O componente define apenas seu espaçamento **interno** (`padding`) e dimensões próprias

> Motivo: Margens externas quebram o encapsulamento e causam comportamento imprevisível quando o componente é reutilizado em contextos diferentes.

---

## 🏗️ FASE 4 — ESTRUTURA DE CÓDIGO

### 4.1 — Interface de Props (API do Componente)

- [ ] Todas as props estão tipadas (TypeScript interface/type)
- [ ] Props obrigatórias vs opcionais estão claramente definidas
- [ ] Props opcionais têm valores `default` definidos
- [ ] Nomes de props são semânticos e consistentes com o restante do sistema
- [ ] Eventos seguem convenção `onXxx` (ex: `onClick`, `onChange`, `onClose`)
- [ ] Props de estilo/customização usam `className` ou similar (não múltiplas props de estilo soltas)

### 4.2 — Estrutura de Arquivo e Localização

- [ ] O arquivo está na pasta correta conforme o nível hierárquico:
  ```
  src/
  ├── components/
  │   ├── atoms/
  │   ├── molecules/
  │   ├── organisms/
  │   ├── templates/
  │   └── pages/
  ```
- [ ] O nome do arquivo é `PascalCase` e igual ao nome do componente exportado
- [ ] Existe arquivo `index.ts` para re-export se necessário
- [ ] Estilos, testes e stories estão co-localizados (ou na pasta correta do projeto)

### 4.3 — Lógica de Negócio

- [ ] **Atoms e Molecules:** Zero lógica de negócio. Puramente UI.
- [ ] **Organisms:** Lógica mínima de orquestração de UI. Lógica de negócio deve estar em hooks ou services.
- [ ] **Templates:** Zero lógica. Apenas estrutura de layout.
- [ ] **Pages:** Orquestram lógica via hooks. Não implementam regras de negócio diretamente.
- [ ] Lógica de negócio complexa foi extraída para **custom hooks** ou **services**

---

## ♿ FASE 5 — ACESSIBILIDADE E SEMÂNTICA

- [ ] HTML semântico correto foi usado (`button` para ações, `a` para navegação, `nav`, `main`, `section`, etc.)
- [ ] Atributos ARIA foram adicionados onde necessário (`aria-label`, `aria-describedby`, `role`, etc.)
- [ ] Componente é navegável por teclado (Tab, Enter, Escape onde aplicável)
- [ ] Contraste de cores atende WCAG 2.1 AA (mínimo 4.5:1 para texto normal)
- [ ] Imagens decorativas têm `alt=""` e imagens informativas têm `alt` descritivo
- [ ] Estados de foco estão visíveis e estilizados

---

## 📱 FASE 6 — RESPONSIVIDADE

- [ ] O componente foi testado nos breakpoints definidos no design system
- [ ] Não há larguras/alturas fixas que quebrem o layout em mobile
- [ ] Textos truncam ou quebram de forma controlada em telas pequenas
- [ ] Touch targets têm no mínimo 44x44px em dispositivos móveis

---

## 🧪 FASE 7 — TESTABILIDADE

- [ ] Atoms e Molecules têm ou estão prontos para **unit tests**
- [ ] Organisms têm ou estão prontos para **integration tests**
- [ ] Pages têm ou estão prontos para **E2E tests**
- [ ] O componente é testável de forma isolada (não precisa de toda a aplicação para funcionar)
- [ ] Props de `data-testid` foram adicionadas em elementos interativos chave

---

## 📖 FASE 8 — DOCUMENTAÇÃO

- [ ] O componente tem comentário JSDoc descrevendo seu propósito
- [ ] Props complexas têm comentários explicando seu uso
- [ ] Story no Storybook existe (ou foi planejada) para: estado default, variações principais e estados de erro
- [ ] Exemplos de uso foram documentados se o componente tem API não-trivial

---

## ✅ CHECKLIST RÁPIDO FINAL — PRÉ-ENTREGA

Responder **SIM** para todos antes de entregar o componente:

```
[ ] Verifiquei se o componente já existe antes de criar um novo?
[ ] O nível hierárquico (atom/molecule/organism/template/page) está correto?
[ ] A dependência flui apenas de níveis superiores para inferiores?
[ ] O componente respeita Single Responsibility?
[ ] Não há lógica de negócio onde não deveria haver?
[ ] As margens externas são responsabilidade do componente pai?
[ ] Todas as props estão tipadas com TypeScript?
[ ] Todos os estados visuais relevantes foram implementados?
[ ] HTML semântico e acessibilidade foram considerados?
[ ] O componente é responsivo?
[ ] Está na pasta correta da hierarquia atômica?
[ ] Não há valores hardcoded que deveriam ser tokens/variáveis?
```

---

## ⚠️ VIOLAÇÕES MAIS COMUNS — EVITAR SEMPRE

| Violação | Descrição | Consequência |
|---|---|---|
| **Atom monolítico** | Atom com muita lógica, muitas props, múltiplas responsabilidades | Quebra reusabilidade |
| **Dependência invertida** | Molecule importando Organism | Acoplamento circular |
| **Margin própria** | Componente define sua própria margem externa | Layout imprevisível |
| **Duplicação silenciosa** | Criar componente sem verificar existentes | Inconsistência e débito técnico |
| **Business logic em Atom** | Fazer chamada API ou acessar store em componente primitivo | Impossível de reutilizar |
| **Hardcode de contexto** | Atom que só funciona em uma página específica | Viola a natureza atômica |
| **Estado global em Atom** | Atom que lê diretamente de Redux/Zustand/Context | Acoplamento indevido |
| **Template com dados reais** | Template que faz fetch ou recebe dados de domínio | Mistura responsabilidades |

---

## 📚 REFERÊNCIAS

- Brad Frost — [Atomic Design (livro)](https://atomicdesign.bradfrost.com/)
- Brad Frost — [Capítulo 2: Atomic Design Methodology](https://atomicdesign.bradfrost.com/chapter-2/)
- Benjamin Fox — [Atomic Design for Developers](https://benjaminwfox.com/blog/tech/atomic-design-for-developers)
- React Architecture — [Atomic Design](https://reactarchitecture.org/architecture/atomic-design/)
- Code With Seb — [Scalable Frontend with Atomic Design + Feature Slices](https://www.codewithseb.com/blog/from-components-to-systems-scalable-frontend-with-atomiec-design)

---

> **Lembrete final para a IA:** Design Atômico não é uma burocracia — é um **contrato de qualidade**. Cada item desta checklist existe para prevenir um problema real que acontece em projetos reais. Seguir esses princípios é o que diferencia um componente de uso único de um componente que serve o projeto por anos.
