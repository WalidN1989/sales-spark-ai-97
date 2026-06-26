import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Target, Sparkles, CheckCircle2, Globe } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { findLookalikes } from "@/lib/lookalike.functions";
import { addLookalikeToQualifying } from "@/lib/qualifying.functions";

type LookalikResult = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  country: string | null;
  score: number;
  reasons: string[];
  alreadyInQualifying: boolean;
};

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? "bg-emerald-100 text-emerald-700"
      : score >= 45
        ? "bg-amber-100 text-amber-700"
        : "bg-zinc-100 text-zinc-600";
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", color)}>
      {score}% match
    </span>
  );
}

export function LookalikesPanel({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const qc = useQueryClient();
  const findFn = useServerFn(findLookalikes);
  const addFn = useServerFn(addLookalikeToQualifying);

  const [results, setResults] = useState<LookalikResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const run = async () => {
    setLoading(true);
    try {
      const r = await findFn({ data: { companyId } });
      setResults(r.results);
      if (r.results.length === 0) toast.info("No lookalikes found yet — enrich more prospects first.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const addToQualifying = useMutation({
    mutationFn: (targetId: string) =>
      addFn({
        data: {
          sourceCompanyId: companyId,
          targetCompanyId: targetId,
          sourceLeadPurchaseId: null,
        },
      }),
    onSuccess: (r, targetId) => {
      qc.invalidateQueries({ queryKey: ["qualifying"] });
      setAdded((prev) => new Set([...prev, targetId]));
      toast.success(r.created ? "Added to Qualifying" : "Already in Qualifying");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Companies similar to <span className="font-medium text-foreground">{companyName}</span> across your prospects.
        </p>
        <Button size="sm" variant="outline" onClick={run} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          )}
          {results === null ? "Find Lookalikes" : "Re-run"}
        </Button>
      </div>

      {results !== null && (
        <>
          {results.length === 0 ? (
            <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              No lookalikes found yet. The more prospects you enrich (industry, country, products), the better the matches.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {results.map((r) => {
                const isAdded = added.has(r.id) || r.alreadyInQualifying;
                return (
                  <div key={r.id} className="flex items-start gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-sm">{r.name}</span>
                        <ScoreBadge score={r.score} />
                        {isAdded && (
                          <span className="flex items-center gap-0.5 text-[10px] text-emerald-600 font-semibold">
                            <CheckCircle2 className="h-3 w-3" /> In Qualifying
                          </span>
                        )}
                      </div>
                      {r.domain && (
                        <a
                          href={/^https?:\/\//i.test(r.domain) ? r.domain : `https://${r.domain}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:underline"
                        >
                          <Globe className="h-3 w-3" />
                          {r.domain}
                        </a>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.reasons.map((reason, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px] font-normal py-0">
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={isAdded ? "ghost" : "outline"}
                      disabled={isAdded || addToQualifying.isPending}
                      onClick={() => addToQualifying.mutate(r.id)}
                      className="shrink-0"
                    >
                      {isAdded ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <>
                          <Target className="mr-1 h-3.5 w-3.5" /> Add
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
