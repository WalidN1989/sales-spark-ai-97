import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/leads/TagInput";
import { upsertIcpProfile, type IcpProfile } from "@/lib/icp.functions";

type Pair = { a: string; b: string };

function RowsEditor({
  label,
  rows,
  onChange,
  aPlaceholder,
  bPlaceholder,
}: {
  label: string;
  rows: Pair[];
  onChange: (r: Pair[]) => void;
  aPlaceholder: string;
  bPlaceholder: string;
}) {
  const set = (i: number, key: "a" | "b", v: string) => {
    const next = [...rows];
    next[i] = { ...next[i], [key]: v };
    onChange(next);
  };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Label>{label}</Label>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onChange([...rows, { a: "", b: "" }])}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex items-start gap-2">
            <Input value={r.a} placeholder={aPlaceholder} onChange={(e) => set(i, "a", e.target.value)} className="flex-1" />
            <Input value={r.b} placeholder={bPlaceholder} onChange={(e) => set(i, "b", e.target.value)} className="flex-1" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-0.5 h-8 w-8 shrink-0 text-muted-foreground hover:text-rose-600"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function IcpEditor({ initial, onSaved }: { initial: IcpProfile | null; onSaved: (id: string) => void }) {
  const saveFn = useServerFn(upsertIcpProfile);

  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [industries, setIndustries] = useState<string[]>(initial?.industries ?? []);
  const [headcount, setHeadcount] = useState(initial?.headcount ?? "");
  const [personas, setPersonas] = useState<Pair[]>(
    (initial?.personas ?? []).map((p) => ({ a: p.title, b: p.description ?? "" })),
  );
  const [useCases, setUseCases] = useState<Pair[]>(
    (initial?.use_cases ?? []).map((u) => ({ a: u.title, b: u.description ?? "" })),
  );
  const [customers, setCustomers] = useState<Pair[]>(
    (initial?.customers ?? []).map((c) => ({ a: c.name, b: c.segment ?? "" })),
  );
  const [competitors, setCompetitors] = useState<Pair[]>(
    (initial?.competitors ?? []).map((c) => ({ a: c.name, b: c.url ?? "" })),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: initial?.id,
          name: name.trim(),
          category: category.trim() || null,
          summary: summary.trim() || null,
          industries,
          headcount: headcount.trim() || null,
          personas: personas.filter((p) => p.a.trim()).map((p) => ({ title: p.a.trim(), description: p.b.trim() || null })),
          use_cases: useCases.filter((u) => u.a.trim()).map((u) => ({ title: u.a.trim(), description: u.b.trim() || null })),
          customers: customers.filter((c) => c.a.trim()).map((c) => ({ name: c.a.trim(), segment: c.b.trim() || null })),
          competitors: competitors.filter((c) => c.a.trim()).map((c) => ({ name: c.a.trim(), url: c.b.trim() || null })),
          notes: notes.trim() || null,
        },
      }),
    onSuccess: (res) => {
      toast.success(initial ? "Saved" : "ICP created");
      onSaved(res.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Product / service name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={300} placeholder="e.g. Canteen Management System" />
        </div>
        <div>
          <Label>Category</Label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={120} placeholder="Software / Hardware / Solution" />
        </div>
      </div>

      <div>
        <Label>Summary</Label>
        <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="One-line description of what it is and who it's for." />
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-3 text-sm font-semibold">Ideal Customer Profile</div>
        <div className="space-y-3">
          <div>
            <Label>Core industries / verticals</Label>
            <TagInput value={industries} onChange={setIndustries} placeholder="Type an industry, press Enter" />
          </div>
          <div>
            <Label>Target headcount / system setup</Label>
            <Textarea value={headcount} onChange={(e) => setHeadcount(e.target.value)} rows={2} placeholder="e.g. 150–10,000+ daily dining workers across the Middle East" />
          </div>
          <RowsEditor label="Buyer personas" rows={personas} onChange={setPersonas} aPlaceholder="Persona (e.g. HR & Ops Manager)" bPlaceholder="What they want (optional)" />
          <RowsEditor label="Use cases" rows={useCases} onChange={setUseCases} aPlaceholder="Use case" bPlaceholder="Detail (optional)" />
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-3 text-sm font-semibold">Existing customers</div>
        <RowsEditor label="Who bought this" rows={customers} onChange={setCustomers} aPlaceholder="Customer name" bPlaceholder="Segment (Hotels, Manufacturing…)" />
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-3 text-sm font-semibold">Competitors</div>
        <RowsEditor label="Pages promoting the same product/solution" rows={competitors} onChange={setCompetitors} aPlaceholder="Competitor name" bPlaceholder="URL" />
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything else — positioning, pricing angle, Grok research prompts…" />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => (name.trim() ? save.mutate() : toast.error("Give it a product name"))} disabled={save.isPending}>
          {save.isPending ? "Saving…" : initial ? "Save changes" : "Create ICP"}
        </Button>
      </div>
    </div>
  );
}
