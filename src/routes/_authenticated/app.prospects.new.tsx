import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { ArrowLeft, ClipboardPaste, Globe, Image as ImageIcon, Sparkles, Upload, X } from "lucide-react";
import {
  createCompany,
  extractCompanyFromImage,
  extractCompanyFromText,
  extractCompanyFromUrl,
} from "@/lib/companies.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/prospects/new")({
  head: () => ({ meta: [{ title: "Add company — Sales Insights" }] }),
  component: NewCompanyPage,
});

type Form = {
  name: string;
  domain: string;
  country: string;
  industry: string;
  contact_person: string;
  email: string;
  phone: string;
  product_service: string;
  address: string;
};

const empty: Form = {
  name: "",
  domain: "",
  country: "UAE",
  industry: "",
  contact_person: "",
  email: "",
  phone: "",
  product_service: "",
  address: "",
};

function NewCompanyPage() {
  const navigate = useNavigate();
  const create = useServerFn(createCompany);
  const extractText = useServerFn(extractCompanyFromText);
  const extractImage = useServerFn(extractCompanyFromImage);
  const extractUrl = useServerFn(extractCompanyFromUrl);

  const [form, setForm] = useState<Form>(empty);
  const [busy, setBusy] = useState(false);

  // Text tab
  const [paste, setPaste] = useState("");
  const [extractingText, setExtractingText] = useState(false);

  // Image tab
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [extractingImage, setExtractingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URL tab
  const [url, setUrl] = useState("");
  const [extractingUrl, setExtractingUrl] = useState(false);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const applyExtracted = (r: Record<string, string | null>) => {
    setForm((f) => ({
      name: r.name ?? f.name,
      domain: r.domain ?? f.domain,
      country: r.country ?? f.country,
      industry: r.industry ?? f.industry,
      contact_person: r.contact_person ?? f.contact_person,
      email: r.email ?? f.email,
      phone: r.phone ?? f.phone,
      product_service: r.product_service ?? f.product_service,
      address: r.address ?? f.address,
    }));
    toast.success("Fields extracted. Review and save.");
  };

  // ---- Text ----
  const runTextExtract = async (text: string) => {
    if (!text.trim()) return toast.error("Paste something first");
    setExtractingText(true);
    try {
      applyExtracted(await extractText({ data: { text } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setExtractingText(false);
    }
  };
  const handleExtractText = () => runTextExtract(paste);
  const onPasteSignature = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text.trim()) return;
    e.preventDefault();
    setPaste(text);
    void runTextExtract(text);
  };
  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setPaste(t);
      void runTextExtract(t);
    } catch {
      toast.error("Couldn't read clipboard");
    }
  };

  // ---- Image ----
  const onPickFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Pick an image file");
    if (file.size > 6 * 1024 * 1024) return toast.error("Image too large (max 6 MB)");
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => toast.error("Couldn't read file");
    reader.readAsDataURL(file);
  };
  const pasteImageFromClipboard = async () => {
    try {
      const items: ClipboardItem[] = await (navigator.clipboard as Clipboard & {
        read: () => Promise<ClipboardItem[]>;
      }).read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          onPickFile(new File([blob], "pasted", { type }));
          return;
        }
      }
      toast.error("No image on clipboard");
    } catch {
      toast.error("Clipboard images not available — use the file picker");
    }
  };
  const handleExtractImage = async () => {
    if (!imageDataUrl) return toast.error("Add an image first");
    setExtractingImage(true);
    try {
      applyExtracted(await extractImage({ data: { imageDataUrl } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setExtractingImage(false);
    }
  };

  // ---- URL ----
  const handleExtractUrl = async () => {
    if (!url.trim()) return toast.error("Enter a URL");
    setExtractingUrl(true);
    try {
      const result = await extractUrl({ data: { url } });
      // strip our internal _scrape field before applying
      const { _scrape, ...fields } = result as Record<string, string | null> & {
        _scrape?: unknown;
      };
      void _scrape;
      applyExtracted(fields);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setExtractingUrl(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Company name is required");
    setBusy(true);
    try {
      const row = await create({ data: form });
      toast.success("Company saved");
      navigate({ to: "/app/prospects/$id", params: { id: row.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/prospects">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Quick add with AI
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="text">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="text">
                <ClipboardPaste className="mr-1 h-4 w-4" /> Text
              </TabsTrigger>
              <TabsTrigger value="image">
                <ImageIcon className="mr-1 h-4 w-4" /> Image
              </TabsTrigger>
              <TabsTrigger value="url">
                <Globe className="mr-1 h-4 w-4" /> Website
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-3 pt-3">
              <Textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                onPaste={onPasteSignature}
                placeholder="Paste an email signature or company snippet — extraction runs automatically…"
                rows={5}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={pasteFromClipboard}>
                  <ClipboardPaste className="mr-1 h-4 w-4" /> Paste from clipboard
                </Button>
                <Button type="button" size="sm" onClick={handleExtractText} disabled={extractingText}>
                  <Sparkles className="mr-1 h-4 w-4" />
                  {extractingText ? "Extracting…" : "Extract fields"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="image" className="space-y-3 pt-3">
              {imageDataUrl ? (
                <div className="relative inline-block">
                  <img
                    src={imageDataUrl}
                    alt="preview"
                    className="max-h-56 rounded border border-border"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute right-1 top-1 h-6 w-6"
                    onClick={() => setImageDataUrl(null)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border p-6 text-sm text-muted-foreground"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    onPickFile(e.dataTransfer.files?.[0]);
                  }}
                >
                  <ImageIcon className="h-6 w-6" />
                  <div>Drop a business card or screenshot here</div>
                  <div className="text-xs">PNG / JPG / WebP, up to 6 MB</div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0])}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-1 h-4 w-4" /> Choose file
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={pasteImageFromClipboard}>
                  <ClipboardPaste className="mr-1 h-4 w-4" /> Paste from clipboard
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleExtractImage}
                  disabled={extractingImage || !imageDataUrl}
                >
                  <Sparkles className="mr-1 h-4 w-4" />
                  {extractingImage ? "Extracting…" : "Extract fields"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="url" className="space-y-3 pt-3">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="example.com or https://example.com"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleExtractUrl}
                  disabled={extractingUrl}
                >
                  <Sparkles className="mr-1 h-4 w-4" />
                  {extractingUrl ? "Scraping & extracting…" : "Fetch & extract"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Uses Firecrawl to read the homepage, then AI fills the form.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name *" v={form.name} on={set("name")} />
            <Field label="Domain" v={form.domain} on={set("domain")} placeholder="acme.com" />
            <Field label="Industry" v={form.industry} on={set("industry")} />
            <Field label="Country" v={form.country} on={set("country")} />
            <Field label="Contact person" v={form.contact_person} on={set("contact_person")} />
            <Field label="Email" v={form.email} on={set("email")} type="email" />
            <Field label="Phone" v={form.phone} on={set("phone")} />
            <Field label="Product / service bought" v={form.product_service} on={set("product_service")} />
            <div className="sm:col-span-2">
              <Label>Address</Label>
              <Textarea value={form.address} onChange={set("address")} rows={2} />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => navigate({ to: "/app/prospects" })}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save company"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  v,
  on,
  type = "text",
  placeholder,
}: {
  label: string;
  v: string;
  on: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={v} onChange={on} type={type} placeholder={placeholder} />
    </div>
  );
}
