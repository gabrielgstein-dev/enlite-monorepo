-- Migration 066: Torna worker_id nullable em whatsapp_bulk_dispatch_logs
--
-- Permite registrar envios diretos (/whatsapp/direct) para números que não
-- correspondem a nenhum worker cadastrado. worker_id fica NULL nesses casos.
-- A FK para workers(id) é mantida — quando preenchido, o vínculo é validado.

ALTER TABLE whatsapp_bulk_dispatch_logs
  ALTER COLUMN worker_id DROP NOT NULL;
