# Enlite Monorepo — Guia para Claude

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
- **Testes visuais obrigatórios**: todo teste de frontend DEVE incluir screenshot assertion via Playwright (`toHaveScreenshot()`) para garantir e validar a mudança visual. Testes sem validação visual são considerados incompletos.

---

## Migrations

Arquivos SQL ficam em `worker-functions/migrations/` com prefixo numérico sequencial (ex: `104_recreate_worker_availability.sql`). Migrações são **aditivas** — nunca dropar tabela/coluna sem deprecação.

### Produção (Cloud SQL)

```bash
./scripts/run-migration-prod.sh worker-functions/migrations/104_recreate_worker_availability.sql
```

Requer: `gcloud` autenticado no projeto `enlite-prd`, `cloud-sql-proxy` e `psql` instalados, e acesso ao secret `enlite-ar-db-password` no Secret Manager. O script conecta via Cloud SQL Proxy na porta 5435, executa o SQL e encerra o proxy automaticamente.

### Local / Docker (E2E)

```bash
cd worker-functions && node scripts/run-migrations-docker.js
```

Usa `DATABASE_URL` (default: `postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e`). Runner idempotente com tabela `schema_migrations` — migrations já aplicadas são puladas.

---

## Orquestração de Agentes

Este monorepo usa subagentes especializados em `.claude/agents/`. O fluxo padrão para features cross-project é:

```
1. PO analisa requisito + arquitetura + regras de negócio → refina e decompõe
2. Backend Dev implementa (respeitando worker-functions/CLAUDE.md)
3. Frontend Dev implementa (respeitando enlite-frontend/CLAUDE.md)
4. QA valida (testes E2E + unitários + lint + type-check + critérios de aceite)
5. PO revisa o diff final contra as regras de negócio e critérios de aceite
```

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
