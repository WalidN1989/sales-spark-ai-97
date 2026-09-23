import { supabase } from "@/integrations/supabase/client";

export type SinhalaSpeechProvider = "azure" | "openai" | "elevenlabs";

export async function getSinhalaSpeechStatus() {
  const { data, error } = await supabase.functions.invoke("sinhala-speech", {
    body: { action: "status" },
  });
  if (error) throw error;
  return data as { provider: SinhalaSpeechProvider | null };
}

export async function synthesizeSinhalaSpeech(text: string) {
  const { data, error } = await supabase.functions.invoke("sinhala-speech", {
    body: { action: "synthesize", text },
  });
  if (error) throw error;
  if (!(data instanceof Blob)) throw new Error("The speech provider returned an invalid response.");
  return data;
}
