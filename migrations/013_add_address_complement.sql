-- Migration: Add address_complement column to worker_service_areas
-- Created: 2026-03-19

-- Adicionar coluna para complemento de endereço (apartamento, sala, etc.)
ALTER TABLE worker_service_areas
  ADD COLUMN IF NOT EXISTS address_complement TEXT;

-- Comentário para documentação
COMMENT ON COLUMN worker_service_areas.address_complement IS 'Complemento do endereço (apartamento, sala, bloco, etc.)';

-- Verificar se a coluna foi adicionada corretamente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'worker_service_areas' 
    AND column_name = 'address_complement'
  ) THEN
    RAISE EXCEPTION 'Migration failed: address_complement column not created';
  END IF;
  
  RAISE NOTICE 'Migration completed successfully: address_complement column added to worker_service_areas';
END $$;
