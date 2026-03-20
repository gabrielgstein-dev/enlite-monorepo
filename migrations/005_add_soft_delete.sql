-- Migration: Adicionar Soft Delete (deleted_at) nas tabelas principais
-- Isso permite deleção virtual (mais usada) enquanto mantém hard delete com CASCADE para LGPD

-- Adicionar deleted_at na tabela users
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

-- Adicionar deleted_at na tabela workers
ALTER TABLE workers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_workers_deleted_at ON workers(deleted_at) WHERE deleted_at IS NOT NULL;

-- Adicionar deleted_at nas tabelas relacionadas
ALTER TABLE worker_service_areas ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE worker_availability ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE worker_quiz_responses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Criar view para usuários ativos (excluindo soft deleted)
CREATE OR REPLACE VIEW users_active AS
SELECT * FROM users WHERE deleted_at IS NULL;

-- Criar view para workers ativos
CREATE OR REPLACE VIEW workers_active AS
SELECT * FROM workers WHERE deleted_at IS NULL;

-- Função para soft delete de usuário (atualiza deleted_at ao invés de deletar)
CREATE OR REPLACE FUNCTION soft_delete_user(p_firebase_uid VARCHAR)
RETURNS VOID AS $$
BEGIN
    -- Soft delete do usuário
    UPDATE users SET deleted_at = NOW() WHERE firebase_uid = p_firebase_uid;
    
    -- Soft delete dos workers associados
    UPDATE workers SET deleted_at = NOW() 
    WHERE auth_uid = p_firebase_uid AND deleted_at IS NULL;
    
    -- Soft delete das áreas de serviço
    UPDATE worker_service_areas SET deleted_at = NOW()
    WHERE worker_id IN (SELECT id FROM workers WHERE auth_uid = p_firebase_uid);
    
    -- Soft delete da disponibilidade
    UPDATE worker_availability SET deleted_at = NOW()
    WHERE worker_id IN (SELECT id FROM workers WHERE auth_uid = p_firebase_uid);
END;
$$ LANGUAGE plpgsql;

-- Função para restaurar usuário soft deleted
CREATE OR REPLACE FUNCTION restore_user(p_firebase_uid VARCHAR)
RETURNS VOID AS $$
BEGIN
    -- Restaurar usuário
    UPDATE users SET deleted_at = NULL WHERE firebase_uid = p_firebase_uid;
    
    -- Restaurar workers
    UPDATE workers SET deleted_at = NULL WHERE auth_uid = p_firebase_uid;
    
    -- Restaurar áreas
    UPDATE worker_service_areas SET deleted_at = NULL
    WHERE worker_id IN (SELECT id FROM workers WHERE auth_uid = p_firebase_uid);
    
    -- Restaurar disponibilidade
    UPDATE worker_availability SET deleted_at = NULL
    WHERE worker_id IN (SELECT id FROM workers WHERE auth_uid = p_firebase_uid);
END;
$$ LANGUAGE plpgsql;

-- Função para hard delete (LGPD - remoção permanente)
CREATE OR REPLACE FUNCTION hard_delete_user(p_firebase_uid VARCHAR)
RETURNS VOID AS $$
DECLARE
    v_worker_ids UUID[];
BEGIN
    -- Coletar IDs dos workers
    SELECT ARRAY_AGG(id) INTO v_worker_ids 
    FROM workers WHERE auth_uid = p_firebase_uid;
    
    -- Hard delete das áreas de serviço (CASCADE)
    DELETE FROM worker_service_areas WHERE worker_id = ANY(v_worker_ids);
    
    -- Hard delete da disponibilidade (CASCADE)
    DELETE FROM worker_availability WHERE worker_id = ANY(v_worker_ids);
    
    -- Hard delete dos quiz responses (CASCADE)
    DELETE FROM worker_quiz_responses WHERE worker_id = ANY(v_worker_ids);
    
    -- Hard delete dos workers
    DELETE FROM workers WHERE auth_uid = p_firebase_uid;
    
    -- Hard delete do usuário
    DELETE FROM users WHERE firebase_uid = p_firebase_uid;
END;
$$ LANGUAGE plpgsql;

-- Trigger para impedir que usuários soft deleted sejam retornados em queries normais
-- (Isso é opcional - pode ser feito via views ou queries explicitas)

COMMENT ON FUNCTION soft_delete_user IS 'Soft delete - marca registro como deletado sem remover (uso padrão)';
COMMENT ON FUNCTION hard_delete_user IS 'Hard delete - remoção permanente com CASCADE (uso LGPD)';
COMMENT ON FUNCTION restore_user IS 'Restaura usuário previamente soft deleted';
