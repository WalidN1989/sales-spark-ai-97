import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, ClipboardPaste, Sparkles } from "lucide-react";
import { createCompany, extractCompanyFromText } from "@/lib/companies.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const extract = useServerFn(extractCompanyFromText);
  const [form, setForm] = useState<Form>(empty);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleExtract = async () => {
    if (!paste.trim()) return toast.error("Paste something first");
    setExtracting(true);
    try {
      const result = await extract({ data: { text: paste } });
      setForm((f) => ({
        name: result.name ?? f.name,
        domain: result.domain ?? f.domain,
        country: result.country ?? f.country,
        industry: result.industry ?? f.industry,
        contact_person: result.contact_person ?? f.contact_person,
        email: result.email ?? f.email,
        phone: result.phone ?? f.phone,
        product_service: result.product_service ?? f.product_service,
        address: result.address ?? f.address,
      }));
      toast.success("Fields extracted. Review and save.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setPaste(t);
    } catch {
      toast.error("Couldn't read clipboard");
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
        <Link to="/app/prospects"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Quick add via clipboard
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Paste an email signature or company snippet here…"
            rows={5}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={pasteFromClipboard}>
              <ClipboardPaste className="mr-1 h-4 w-4" /> Paste from clipboard
            </Button>
            <Button type="button" size="sm" onClick={handleExtract} disabled={extracting}>
              <Sparkles className="mr-1 h-4 w-4" />
              {extracting ? "Extracting…" : "Extract fields with AI"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Company details</CardTitle></CardHeader>
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
              <Button type="button" variant="ghost" onClick={() => navigate({ to: "/app/prospects" })}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save company"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label, v, on, type = "text", placeholder,
}: { label: string; v: string; on: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={v} onChange={on} type={type} placeholder={placeholder} />
    </div>
  );
}
