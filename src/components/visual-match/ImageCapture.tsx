import { useRef, useState } from "react";
import { Camera, Upload, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BUCKET = "visual-match-uploads";

export function ImageCapture({
  onUploaded,
  disabled,
}: {
  onUploaded: (path: string, previewUrl: string, label?: string) => void;
  disabled?: boolean;
}) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [label, setLabel] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  async function uploadFile(file: File) {
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      onUploaded(path, objectUrl, label.trim() || undefined);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFromUrl() {
    if (!urlInput.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(urlInput.trim());
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
      const blob = await res.blob();
      const file = new File([blob], "from-url.jpg", { type: blob.type || "image/jpeg" });
      await uploadFile(file);
      setUrlInput("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not fetch image");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Label (optional)</label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Bur Dubai banks – Tuesday walk"
          className="mt-1"
        />
      </div>

      <Tabs defaultValue="camera">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="camera"><Camera className="h-4 w-4 mr-1" />Camera</TabsTrigger>
          <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-1" />Upload</TabsTrigger>
          <TabsTrigger value="url">URL</TabsTrigger>
        </TabsList>

        <TabsContent value="camera" className="pt-3">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            size="lg"
            className="w-full h-16 text-base"
            disabled={busy || disabled}
            onClick={() => cameraRef.current?.click()}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5 mr-2" />}
            Take photo
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Opens your phone's rear camera. Best for street walks.
          </p>
        </TabsContent>

        <TabsContent value="upload" className="pt-3">
          <input
            ref={uploadRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="w-full h-16 text-base"
            disabled={busy || disabled}
            onClick={() => uploadRef.current?.click()}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5 mr-2" />}
            Choose image
          </Button>
        </TabsContent>

        <TabsContent value="url" className="pt-3 space-y-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://example.com/photo.jpg"
          />
          <Button
            type="button"
            className="w-full"
            disabled={busy || disabled || !urlInput.trim()}
            onClick={uploadFromUrl}
          >
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Fetch & search
          </Button>
        </TabsContent>
      </Tabs>

      {preview && (
        <div className="relative w-32 h-32 rounded-lg overflow-hidden border">
          <img src={preview} alt="preview" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-1"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
