-- Twilio retries webhook deliveries. Make the provider SID idempotent so a
-- retry cannot duplicate a WhatsApp message or conversation entry.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_sid_unique
  ON public.whatsapp_messages (message_sid);
