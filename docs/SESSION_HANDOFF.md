# Session Handoff — Enlite Infra

> Histórico cronológico de sessões de desenvolvimento (humano ou IA-assistido).
> Append-only. **Leia antes de começar uma nova sessão** para entender o estado
> atual do trabalho em andamento e os próximos passos.
>
> Diferença em relação ao [LOG.md](LOG.md): aquele registra **incidentes,
> hotfixes e decisões operacionais** já fechadas. Este aqui registra **estado
> de trabalho em progresso ou recém concluído**, com foco em "onde estamos e
> pra onde vamos".

---

## Convenção

Cada sessão adiciona uma entrada no topo (mais recente primeiro) com:

```markdown
## YYYY-MM-DD HH:MM — <título curto>

**Contexto**: 1-3 linhas explicando o que foi pedido.

**O que foi feito**:
- bullets curtos
- com refs a commits/arquivos quando relevante

**O que NÃO foi feito** (escopo cortado, blockers, scope creep evitado):
- bullets curtos

**Próxima sessão deve**:
- 1. ação concreta
- 2. ação concreta
- ...

**Refs**:
- commits, docs, issues, PRs
```

Quando uma entrada vira "histórico antigo" (>30 dias) e os próximos passos já
foram cumpridos, mover para uma seção "Arquivo" no rodapé do arquivo (ou
deletar se redundante com LOG.md).

---

## 2026-04-25 — Phase 1 da PatientDetailPage (4 tabs read-only) DONE

**Contexto**: Implementar telas "amostragem" do paciente conforme Figma
frame `2483:17521`. Trabalho autônomo via Claude Code com dev offline,
comunicação async por Telegram.

**O que foi feito**:
- 4 commits em main (`769a68a..2fc4f91`) — uma tab por commit, cada um
  com unit + visual diff Figma + E2E happy + alt + integração docker.
- Backend: novo endpoint `GET /api/admin/patients/:id` com use case +
  repo helper + Zod validator + 13 tests.
- Frontend: PatientDetailPage + 8 cards (Identidade, Informações Gerais,
  Diagnóstico, Projeto Terapêutico, Equipe Tratante, Supervisão,
  Relatórios, Familiares, Cobertura Médica, Localizações, Serviços
  Contratados, Enquadre Terapêutico) + tab system + 82 unit tests.
- Visual diff helper reusável + fetch script para references Figma
  (improve 004).
- Telegram bot setup pra comunicação async (improve 005).
- Detecção runtime de locale via URL/localStorage (improve 006).
- Fix de race no Firebase auth state em hard navigations (improve 007).
- Token Figma temporário guardado em `.env.local` para re-fetch de
  references (escopo limitado a leitura).

**O que NÃO foi feito** (intencional, deixado como TODO ou backlog):
- **Phase 2 (telas de edição)**: 11 modais/forms de edição em backlog.
  Ficam atrás da decisão do time sobre quando abrir o fluxo de edição.
- **Schema novo**: nenhuma migration. Campos Figma sem coluna no banco
  (`genderIdentity`, `religion`, `languages`, `racialOrigin`, tabela
  `therapeutic_projects`, `supervisions`, `attendance_reports`,
  `contracted_services`) ficam como `—` com TODO inline.
- **Fontes Poppins/Lexend no Playwright**: threshold do visual diff é
  0.15 em vez de 0.05 ideal. Carregar fontes no browser de teste destrava.
- **Refactor `GeneralInfoTab.tsx` (improve 001)**: 580 linhas, fora do
  escopo desta sessão.

**Próxima sessão deve**:
1. Decidir se vai popular o EnquadreTerapeuticoCard com dados reais de
   `worker_job_applications` filtrados por `patient_id` ou se mantém
   placeholder até criar endpoint dedicado (ver pergunta aberta abaixo).
2. (Opcional) Carregar fontes Poppins/Lexend no Playwright para apertar
   o threshold visual de 0.15 → 0.05.
3. (Opcional) Atacar improve 001 (split do `GeneralInfoTab.tsx`).
4. Refazer fetch das references Figma com novo token quando o atual
   for revogado.

**Pergunta aberta para o dev** (foi colocada no fim da sessão, antes do
handoff):
> "Encuadre por exemplo, temos dados suficientes para mostrar todas as
> informações que mostra no figma?"

Resposta inicial está em [features/patient-detail-page.md](features/patient-detail-page.md)
("Schema gaps tratados como TODO") e em
[ROADMAP_PATIENT_ENQUADRE_SCREENS.md](ROADMAP_PATIENT_ENQUADRE_SCREENS.md).
Detalhe técnico de cada coluna faltando precisa ser decidido na próxima
sessão antes de plugar dados.

**Refs**:
- Commits: `769a68a` (Phase A), `0ec5955` (Phase B), `89b56b3` (Phase C),
  `2fc4f91` (Phase D)
- Docs: [features/patient-detail-page.md](features/patient-detail-page.md),
  [improves/004..007](improves/), [LOG.md](LOG.md) (entrada de 2026-04-25)
- Roadmap: [ROADMAP_PATIENT_ENQUADRE_SCREENS.md](ROADMAP_PATIENT_ENQUADRE_SCREENS.md)
