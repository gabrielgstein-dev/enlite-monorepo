-- Migration 065: Adiciona rastreamento de entrega via Twilio webhooks
--
-- messaging_outbox: twilio_sid para correlacionar o callback + delivery_status para resultado final
-- whatsapp_bulk_dispatch_logs: delivery_status (twilio_sid já existe)

ALTER TABLE messaging_outbox
  ADD COLUMN IF NOT EXISTS twilio_sid VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(30) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_messaging_outbox_twilio_sid
  ON messaging_outbox(twilio_sid) WHERE twilio_sid IS NOT NULL;

ALTER TABLE whatsapp_bulk_dispatch_logs
  ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(30) DEFAULT NULL;

COMMENT ON COLUMN messaging_outbox.twilio_sid IS 'SID retornado pelo Twilio (MM...). Usado para correlacionar status callbacks.';
COMMENT ON COLUMN messaging_outbox.delivery_status IS 'Status final de entrega reportado pelo Twilio: delivered, read, undelivered, failed.';
COMMENT ON COLUMN whatsapp_bulk_dispatch_logs.delivery_status IS 'Status final de entrega reportado pelo Twilio: delivered, read, undelivered, failed.';
