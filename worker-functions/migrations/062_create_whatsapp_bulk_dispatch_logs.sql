-- Migration 062: Tabela de log de disparos em massa de WhatsApp
--
-- Rastreia cada envio individual de campanhas bulk (ex: notificação de cadastro incompleto).
-- Permite auditoria de quem disparou, para quem, quando, e se deu erro.

CREATE TABLE whatsapp_bulk_dispatch_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id      UUID NOT NULL REFERENCES workers(id),
  triggered_by   VARCHAR(255) NOT NULL,          -- UID do admin que disparou
  phone          VARCHAR(50) NOT NULL,            -- número normalizado que recebeu a mensagem
  template_slug  VARCHAR(100) NOT NULL,
  status         VARCHAR(20) NOT NULL             -- 'sent' | 'error'
                   CHECK (status IN ('sent', 'error')),
  twilio_sid     VARCHAR(100),                    -- SM... retornado pelo Twilio (NULL se erro)
  error_message  TEXT,                            -- mensagem de erro (NULL se sent)
  dispatched_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE whatsapp_bulk_dispatch_logs IS
  'Registro individual de cada mensagem disparada via bulk dispatch.
   triggered_by = Firebase UID do admin. Um envio em lote gera N linhas.';

CREATE INDEX idx_wbdl_worker_id     ON whatsapp_bulk_dispatch_logs(worker_id);
CREATE INDEX idx_wbdl_triggered_by  ON whatsapp_bulk_dispatch_logs(triggered_by);
CREATE INDEX idx_wbdl_dispatched_at ON whatsapp_bulk_dispatch_logs(dispatched_at DESC);
CREATE INDEX idx_wbdl_status        ON whatsapp_bulk_dispatch_logs(status);
