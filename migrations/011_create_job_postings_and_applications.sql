-- Migration 011: Create Job Postings and Applications Tables
-- Sistema de vagas e candidaturas

-- Tabela de Vagas
CREATE TABLE IF NOT EXISTS job_postings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Dados da vaga
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    
    -- Requisitos (para matching futuro)
    required_profession VARCHAR(50),
    required_experience_years VARCHAR(20),
    required_languages TEXT[] DEFAULT '{}',
    preferred_age_range VARCHAR(30),
    
    -- Localização
    city VARCHAR(100),
    state VARCHAR(50),
    country CHAR(2) DEFAULT 'AR',
    is_remote BOOLEAN DEFAULT false,
    
    -- Detalhes da vaga
    salary_range_min DECIMAL(10,2),
    salary_range_max DECIMAL(10,2),
    currency CHAR(3) DEFAULT 'ARS',  -- ARS, BRL, USD
    work_schedule VARCHAR(50),  -- 'full-time', 'part-time', 'flexible'
    
    -- Configuração da vaga
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    max_applicants INTEGER,
    current_applicants INTEGER DEFAULT 0,
    
    -- Timestamps
    published_at TIMESTAMPTZ,
    closes_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_job_status CHECK (
        status IN ('draft', 'active', 'paused', 'closed', 'filled')
    ),
    CONSTRAINT valid_salary_range CHECK (
        salary_range_min IS NULL OR salary_range_max IS NULL OR salary_range_min <= salary_range_max
    ),
    CONSTRAINT valid_job_country CHECK (
        country IN ('AR', 'BR')
    )
);

-- Tabela de Candidaturas
CREATE TABLE IF NOT EXISTS worker_job_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Relacionamentos
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
    
    -- Status da candidatura
    application_status VARCHAR(20) NOT NULL DEFAULT 'applied',
    -- Estados possíveis:
    -- 'applied': Candidatura enviada
    -- 'under_review': Em análise
    -- 'shortlisted': Pré-selecionado
    -- 'interview_scheduled': Entrevista agendada
    -- 'approved': Aprovado para a vaga
    -- 'rejected': Rejeitado
    -- 'withdrawn': Worker desistiu
    -- 'hired': Contratado
    
    -- Dados da candidatura
    cover_letter TEXT,
    
    -- Match score (para sistema futuro de matching automático)
    match_score DECIMAL(5,2),  -- 0.00 a 100.00
    
    -- Tracking do processo
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    interview_scheduled_at TIMESTAMPTZ,
    decision_at TIMESTAMPTZ,
    hired_at TIMESTAMPTZ,
    
    -- Feedback
    rejection_reason TEXT,
    internal_notes TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_worker_job_application UNIQUE (worker_id, job_posting_id),
    CONSTRAINT valid_application_status CHECK (
        application_status IN (
            'applied', 'under_review', 'shortlisted', 'interview_scheduled',
            'approved', 'rejected', 'withdrawn', 'hired'
        )
    ),
    CONSTRAINT valid_match_score CHECK (
        match_score IS NULL OR (match_score >= 0 AND match_score <= 100)
    )
);

-- Índices para job_postings
CREATE INDEX idx_job_postings_status ON job_postings(status);
CREATE INDEX idx_job_postings_country ON job_postings(country);
CREATE INDEX idx_job_postings_profession ON job_postings(required_profession);
CREATE INDEX idx_job_postings_published ON job_postings(published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX idx_job_postings_active ON job_postings(status, published_at DESC) WHERE status = 'active';

-- Índices para worker_job_applications
CREATE INDEX idx_worker_job_applications_worker ON worker_job_applications(worker_id);
CREATE INDEX idx_worker_job_applications_job ON worker_job_applications(job_posting_id);
CREATE INDEX idx_worker_job_applications_status ON worker_job_applications(application_status);
CREATE INDEX idx_worker_job_applications_match_score ON worker_job_applications(match_score DESC) WHERE match_score IS NOT NULL;
CREATE INDEX idx_worker_job_applications_applied ON worker_job_applications(applied_at DESC);

-- Triggers
CREATE TRIGGER update_job_postings_updated_at 
    BEFORE UPDATE ON job_postings
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_worker_job_applications_updated_at 
    BEFORE UPDATE ON worker_job_applications
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Função para atualizar contador de candidatos
CREATE OR REPLACE FUNCTION update_job_applicants_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE job_postings
        SET current_applicants = current_applicants + 1
        WHERE id = NEW.job_posting_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE job_postings
        SET current_applicants = GREATEST(0, current_applicants - 1)
        WHERE id = OLD.job_posting_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER job_applicants_counter
    AFTER INSERT OR DELETE ON worker_job_applications
    FOR EACH ROW
    EXECUTE FUNCTION update_job_applicants_count();

-- Comentários
COMMENT ON TABLE job_postings IS 'Vagas de trabalho disponíveis para workers';
COMMENT ON TABLE worker_job_applications IS 'Candidaturas de workers a vagas - só permitido se documents_status = approved';
COMMENT ON COLUMN worker_job_applications.match_score IS 'Score de compatibilidade calculado automaticamente (0-100)';
