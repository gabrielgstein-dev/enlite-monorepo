# Enlite Monorepo — Guia para Claude

## REGRAS OBRIGATÓRIAS DE EXECUÇÃO (LEIA PRIMEIRO)

**As regras abaixo são BLOQUEANTES. Você NÃO PODE ignorar, pular ou perguntar se o usuário quer que sejam executadas. Elas DEVEM ser executadas automaticamente, sem pedir confirmação.**

### Fluxo de Feature (OBRIGATÓRIO — executar TODAS as etapas, NESTA ORDEM)

1. **PO** analisa, refina e decompõe o requisito
2. **Backend Dev** implementa (quando aplicável)
3. **Frontend Dev** implementa (quando aplicável)
4. **QA** cria testes (unitários + E2E) E executa validação completa
5. **PO** faz revisão final contra critérios de aceite

**NUNCA pule etapas. NUNCA pergunte "quer que eu faça X?" para etapas deste fluxo — apenas faça.**

### Regra de Testes (OBRIGATÓRIA — sem exceção)

Toda vez que QUALQUER código for criado ou modificado (controller, route, use case, converter, componente, página), os testes correspondentes DEVEM ser criados ou atualizados NA MESMA SESSÃO, ANTES de considerar a tarefa concluída:
- **Testes unitários**: para use cases, converters, componentes com lógica, funções utilitárias
- **Testes E2E**: para endpoints HTTP, páginas com formulários, fluxos completos

**Se você terminou de implementar código e não criou os testes → a tarefa NÃO está concluída. Invoque o agente QA imediatamente.**

### Regra de Revisão Final (OBRIGATÓRIA)

Após o QA aprovar, o PO DEVE ser invocado para revisão final. A tarefa SÓ é considerada DONE após o PO aprovar.

---

## Sobre o Projeto

A **Enlite** é uma plataforma de saúde que gerencia o ciclo de vida completo de **Acompanhantes Terapêuticos (ATs)** — desde a captação e seleção até a supervisão diária da atuação com pacientes.

### Estrutura do Monorepo

```
enlite-monorepo/
  enlite-frontend/   → Painel administrativo da Enlite (React + Vite + TypeScript + Tailwind)
  worker-functions/  → Backend de recrutamento e operação (Node.js + Express + TypeScript + PostgreSQL + Firebase)
```

Cada projeto tem seu próprio `CLAUDE.md` com regras específicas. **Sempre leia o CLAUDE.md do projeto-alvo antes de modificar qualquer código.**

---

## Regras de Negócio — Fluxo Worker (AT)

### 1. Postulação e Pré-Seleção
- Documentação obrigatória: Currículo, certificados, RG/CPF, Antecedentes Penais, comprovante MEI.
- Seguro de Responsabilidade Civil quando disponível.
- Cadastro via plataforma ou canais de captação para triagem inicial.

### 2. Seleção e Contratação
- Entrevista por Valores: foco em honestidade, integridade e compromisso (técnica se ensina, valores não).
- Termo de Confidencialidade e Não Divulgação de Dados obrigatório pós-aprovação.
- Vínculo formalizado via contrato MEI.

### 3. Formação e Capacitação (Onboarding)
- Formação teórica e prática (remota síncrona e assíncrona) com casos clínicos e dinâmicas vivenciais.
- Critério de conclusão: mínimo 75% de frequência + trabalho final integrador.

### 4. Matching (Alocação AT ↔ Paciente)
- Entrevista de Matching: garantir que o AT é o mais indicado para o paciente (patologia + perfil pessoal).
- Critérios: disponibilidade, zoneamento (proximidade geográfica), hotspots de atendimento.

### 5. Operação Diária
- **Comunicação**: Grupos de WhatsApp por caso (AT + supervisores + coordenadores; sem paciente/familiar).
- **Check-in/Check-out GPS**: Registro de jornada via app para automação de folha de ponto e transparência de localização.
- **Relatórios Diários**: Obrigatório via plataforma. Alimentam gráficos de evolução do paciente e são revisados pela estrutura clínica.
- **Supervisão 24h**: Estrutura de supervisão em tempo real disponível para emergências ou dúvidas técnicas.

---

## Arquitetura Compartilhada

Ambos os projetos seguem **Clean Architecture**:

| Camada | Backend (worker-functions) | Frontend (enlite-frontend) |
|---|---|---|
| Domain | `src/domain/` — entidades, interfaces | `src/domain/` — entidades, interfaces |
| Application | `src/application/` — use cases | `src/application/` — use cases |
| Infrastructure | `src/infrastructure/` — repos, services | `src/infrastructure/` — API clients, Firebase |
| Interface | `src/interfaces/` — controllers, rotas | `src/presentation/` — pages, components |

### Regras Universais
- **Máximo 400 linhas por arquivo** de implementação.
- Controllers/pages não contêm lógica de negócio.
- Validação com **Zod** em ambos os projetos.
- **TypeScript strict** em ambos.
- Nunca commitar `.env` — usar `.env.example` como referência.

---

## Orquestração de Agentes

Este monorepo usa subagentes especializados em `.claude/agents/`.

**FLUXO OBRIGATÓRIO — executar TODAS as etapas automaticamente, sem perguntar:**

```
1. PO analisa requisito + arquitetura + regras de negócio → refina e decompõe
2. Backend Dev implementa (respeitando worker-functions/CLAUDE.md)
3. Frontend Dev implementa (respeitando enlite-frontend/CLAUDE.md)
4. QA cria testes (unitários + E2E) E executa validação completa
5. PO revisa o diff final contra as regras de negócio e critérios de aceite
```

**Nenhuma etapa é opcional. Nenhuma etapa requer confirmação do usuário. Execute todas na ordem.**

### Etapa 5 — Revisão Final do PO (obrigatória)

Após o QA aprovar, o PO **sempre** faz uma revisão final antes de considerar a tarefa concluída:
- Verifica se o diff implementado atende **todos** os critérios de aceite do plano original
- Confere se nenhuma regra de negócio foi violada ou esquecida
- Valida que a arquitetura foi respeitada (Clean Architecture, limites de camada)
- Se encontrar problemas, devolve ao dev responsável com descrição clara do gap
- Só após essa revisão a tarefa é considerada **DONE**

### Quando usar cada agente

| Situação | Agente |
|---|---|
| Feature nova que impacta regras de negócio | Começar pelo PO |
| Bug isolado no backend | Backend Dev direto |
| Bug isolado no frontend | Frontend Dev direto |
| Validação de qualidade pós-implementação | QA |
| Feature cross-project (API + tela) | PO → Backend Dev → Frontend Dev → QA → PO (revisão final) |
