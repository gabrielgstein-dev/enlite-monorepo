-- Migration 010: Create Worker Payment Info Table
-- Dados bancários e financeiros do worker para recebimento de pagamentos

CREATE TABLE IF NOT EXISTS worker_payment_info (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL UNIQUE REFERENCES workers(id) ON DELETE CASCADE,
    
    -- Dados bancários
    country CHAR(2) NOT NULL DEFAULT 'AR',
    account_holder_name VARCHAR(200) NOT NULL,
    
    -- Identificação fiscal
    tax_id VARCHAR(30),  -- CUIT/CUIL (Argentina) ou CPF/CNPJ (Brasil)
    
    -- Dados da conta bancária
    bank_name VARCHAR(100),
    bank_branch VARCHAR(50),  -- Agência
    account_number VARCHAR(50),
    account_type VARCHAR(20),  -- 'checking', 'savings'
    
    -- PIX (Brasil) ou CVU/Alias (Argentina)
    pix_key VARCHAR(100),
    
    -- Status de verificação
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- 'pending': Dados não preenchidos
    -- 'submitted': Dados enviados, aguardando verificação
    -- 'verified': Dados verificados e aprovados
    -- 'rejected': Dados rejeitados, precisa corrigir
    
    -- Feedback
    verification_notes TEXT,
    verified_by UUID,
    verified_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_payment_status CHECK (
        payment_status IN ('pending', 'submitted', 'verified', 'rejected')
    ),
    CONSTRAINT valid_account_type CHECK (
        account_type IS NULL OR account_type IN ('checking', 'savings')
    ),
    CONSTRAINT valid_payment_country CHECK (
        country IN ('AR', 'BR')
    )
);

-- Índices
CREATE INDEX idx_worker_payment_info_worker ON worker_payment_info(worker_id);
CREATE INDEX idx_worker_payment_info_status ON worker_payment_info(payment_status);
CREATE INDEX idx_worker_payment_info_country ON worker_payment_info(country);

-- Trigger para auto-update
CREATE TRIGGER update_worker_payment_info_updated_at 
    BEFORE UPDATE ON worker_payment_info
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comentários
COMMENT ON TABLE worker_payment_info IS 'Dados bancários do worker para recebimento de pagamentos';
COMMENT ON COLUMN worker_payment_info.tax_id IS 'CUIT/CUIL (AR) ou CPF/CNPJ (BR)';
COMMENT ON COLUMN worker_payment_info.pix_key IS 'Chave PIX (BR) ou CVU/Alias (AR)';
COMMENT ON COLUMN worker_payment_info.payment_status IS 'Status de verificação dos dados bancários';
