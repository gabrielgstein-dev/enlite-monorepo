-- Migration 058: Torna description nullable em job_postings
--
-- Motivo: VacanciesController.createVacancy() não requer descrição livre ao
-- criar uma vaga manualmente. O campo era NOT NULL desde a migration 011, mas
-- vagas criadas pela UI não têm esse dado no momento da criação — apenas vagas
-- importadas do ClickUp carregam conteúdo em description.

ALTER TABLE job_postings
  ALTER COLUMN description DROP NOT NULL;

COMMENT ON COLUMN job_postings.description IS
  'Descrição livre da vaga (opcional). Preenchida pelo ClickUp import ou edição manual.';
