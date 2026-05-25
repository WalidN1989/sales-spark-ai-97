import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Mail, Phone, Globe, MapPin, Trash2, Sparkles, Loader2, Copy } from "lucide-react";
import { getCompany, deleteCompany, addActivity } from "@/lib/companies.functions";
import { researchCompany, generatePitchEmail } from "@/lib/research.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAccess } from "@/hooks/use-access";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/prospects/$id")({
  head: () => ({ meta: [{ title: "Company — Sales Insights" }] }),
  component: CompanyProfile,
});

function CompanyProfile() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(getCompany);
  const del = useServerFn(deleteCompany);
  const log = useServerFn(addActivity);
  const { can } = useAccess();

  const { data, isLoading } = useQuery({ queryKey: ["company", id], queryFn: () => fn({ data: { id } }) });
  const [note, setNote] = useState("");
  const [type, setType] = useState<"note" | "call" | "visit" | "email">("note");

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data) return null;
  const c = data.company;

  const handleDelete = async () => {
    if (!confirm(`Delete ${c.name}? This can't be undone.`)) return;
    await del({ data: { id } });
    toast.success("Company deleted");
    navigate({ to: "/app/prospects" });
  };

  const handleLog = async () => {
    if (!note.trim()) return;
    await log({ data: { company_id: id, type, content: note } });
    setNote("");
    qc.invalidateQueries({ queryKey: ["company", id] });
    toast.success("Activity logged");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/prospects"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
        {can("prospects", "delete") && (
          <Button variant="ghost" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-2xl">{c.name}</CardTitle>
              <div className="mt-1 flex flex-wrap gap-1 text-xs">
                {c.industry && <span className="rounded bg-secondary px-2 py-0.5">{c.industry}</span>}
                {c.country && <span className="rounded bg-secondary px-2 py-0.5">{c.country}</span>}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          {c.domain && <Row icon={Globe} label={c.domain} />}
          {c.email && <Row icon={Mail} label={c.email} />}
          {c.phone && <Row icon={Phone} label={c.phone} />}
          {c.address && <Row icon={MapPin} label={c.address} />}
          {c.contact_person && <div><span className="text-muted-foreground">Contact: </span>{c.contact_person}</div>}
          {c.product_service && <div><span className="text-muted-foreground">Product: </span>{c.product_service}</div>}
        </CardContent>
      </Card>

      <Tabs defaultValue="activity">
        <TabsList>
          <TabsTrigger value="activity">Activity log</TabsTrigger>
          {can("prospects", "research") && <TabsTrigger value="research">AI research</TabsTrigger>}
          {can("prospects", "pitch") && <TabsTrigger value="pitch">Pitch email</TabsTrigger>}
          <TabsTrigger value="sales">Sales</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="space-y-3">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="flex flex-wrap gap-2">
                <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="visit">Visit</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" rows={3} />
              <div className="flex justify-end">
                <Button onClick={handleLog} disabled={!note.trim()}>Log entry</Button>
              </div>
            </CardContent>
          </Card>
          <div className="space-y-2">
            {data.activities.length === 0 ? (
              <p className="px-2 text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              data.activities.map((a) => (
                <Card key={a.id}>
                  <CardContent className="pt-4">
                    <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded bg-secondary px-2 py-0.5 uppercase">{a.type}</span>
                      <span>{new Date(a.logged_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm">{a.content}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="research">
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              AI deep-research pipeline (Firecrawl, Perplexity, Hunter.io) ships in the next update.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="pitch">
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              AI-generated pitch email ships in the next update.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="sales">
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Sales history for this company will appear here once the Sales module is wired up.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ icon: Icon, label }: { icon: typeof Mail; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span>{label}</span>
    </div>
  );
}
