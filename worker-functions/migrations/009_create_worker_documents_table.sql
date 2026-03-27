-- Migration 009: Create Worker Documents Table
-- Tabela para armazenar URLs dos documentos enviados pelo worker
-- CRÍTICO: Worker só pode se candidatar a vagas após documents_status = 'approved'

CREATE TABLE IF NOT EXISTS worker_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL UNIQUE REFERENCES workers(id) ON DELETE CASCADE,
    
    -- URLs dos documentos (armazenados no Cloud Storage)
    resume_cv_url TEXT,
    identity_document_url TEXT,
    criminal_record_url TEXT,
    professional_registration_url TEXT,
    liability_insurance_url TEXT,
    
    -- Certificados adicionais (array de URLs)
    additional_certificates_urls TEXT[] DEFAULT '{}',
    
    -- Status da documentação
    documents_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- Estados possíveis:
    -- 'pending': Worker ainda não enviou documentos
    -- 'incomplete': Alguns documentos faltando
    -- 'submitted': Todos documentos enviados, aguardando revisão
    -- 'under_review': Em análise pela equipe
    -- 'approved': Documentos aprovados, pode se candidatar a vagas
    -- 'rejected': Documentos rejeitados, precisa reenviar
    
    -- Feedback de revisão
    review_notes TEXT,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    
    -- Tracking de submissão
    submitted_at TIMESTAMPTZ,
    resubmitted_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_documents_status CHECK (
        documents_status IN ('pending', 'incomplete', 'submitted', 'under_review', 'approved', 'rejected')
    )
);

-- Índices
CREATE INDEX idx_worker_documents_worker ON worker_documents(worker_id);
CREATE INDEX idx_worker_documents_status ON worker_documents(documents_status);
CREATE INDEX idx_worker_documents_submitted ON worker_documents(submitted_at DESC) WHERE submitted_at IS NOT NULL;

-- Trigger para auto-update
CREATE TRIGGER update_worker_documents_updated_at 
    BEFORE UPDATE ON worker_documents
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comentários
COMMENT ON TABLE worker_documents IS 'Documentos enviados pelo worker - obrigatórios para candidatura a vagas';
COMMENT ON COLUMN worker_documents.resume_cv_url IS 'URL do currículo em PDF';
COMMENT ON COLUMN worker_documents.identity_document_url IS 'URL do documento de identidade (DNI/RG/CPF) em PDF';
COMMENT ON COLUMN worker_documents.criminal_record_url IS 'URL dos antecedentes penais em PDF';
COMMENT ON COLUMN worker_documents.professional_registration_url IS 'URL do registro profissional (AFIP/CRM/COREN) em PDF';
COMMENT ON COLUMN worker_documents.liability_insurance_url IS 'URL da apólice de seguro de responsabilidade civil em PDF';
COMMENT ON COLUMN worker_documents.documents_status IS 'Status da documentação - worker só pode aplicar a vagas se approved';
