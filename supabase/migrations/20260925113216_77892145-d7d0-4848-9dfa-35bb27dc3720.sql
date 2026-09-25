CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_sid_unique
  ON public.whatsapp_messages (message_sid);