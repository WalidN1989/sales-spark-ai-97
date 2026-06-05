import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { listLearning, deleteLearning } from "@/lib/learning.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/learning/")({
  head: () => ({ meta: [{ title: "Learning — Sales Insights" }] }),
  component: LearningPage,
});

const CATS = [
  { id: "all", label: "All" },
  { id: "writing_style", label: "Writing Style" },
  { id: "business_rule", label: "Business Rules" },
  { id: "objection", label: "Objection Handling" },
  { id: "negotiation", label: "Negotiation" },
] as const;

function LearningPage() {
  const fn = useServerFn(listLearning);
  const del = useServerFn(deleteLearning);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["learning"], queryFn: () => fn() });
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");

  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning"] });
      toast.success("Deleted");
    },
  });

  const filtered = (data ?? []).filter((e) => {
    if (cat !== "all" && e.category !== cat) return false;
    if (q) {
      const s = q.toLowerCase();
      return (
        e.title?.toLowerCase().includes(s) ||
        e.content?.toLowerCase().includes(s) ||
        (e.tags ?? []).some((t) => t.toLowerCase().includes(s))
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Learning</h1>
          <p className="text-sm text-muted-foreground">
            Reusable knowledge that informs AI-generated responses.
          </p>
        </div>
        <Button onClick={() => navigate({ to: "/app/learning/new" })}>
          <Plus className="mr-1 h-4 w-4" /> New entry
        </Button>
      </div>

      <Tabs value={cat} onValueChange={setCat}>
        <TabsList>
          {CATS.map((c) => (
            <TabsTrigger key={c.id} value={c.id}>
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search title, content, tags…"
        className="max-w-md"
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No entries yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((e) => (
            <Card key={e.id}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <Link to="/app/learning/$id" params={{ id: e.id }} className="font-semibold hover:underline">
                    {e.title}
                  </Link>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigate({ to: "/app/learning/$id", params: { id: e.id } })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm("Delete this entry?")) remove.mutate(e.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 text-xs">
                  <Badge variant="secondary">{e.category}</Badge>
                  {(e.tags ?? []).map((t) => (
                    <Badge key={t} variant="outline">
                      {t}
                    </Badge>
                  ))}
                </div>
                {e.situation && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold">Situation:</span> {e.situation}
                  </p>
                )}
                <p className="line-clamp-4 whitespace-pre-wrap text-sm">{e.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
