import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Target,
  Sparkles,
  CheckCircle2,
  Globe,
  AlertTriangle,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { findLookalikes, getLookalikeCache } from "@/lib/lookalike.functions";
import { addSerpResultToQualifying } from "@/lib/qualifying.functions";

type SerpResult = {
  name: string;
  domain: string;
  url: string;
  description: string;
  confidence: number;
  label: "Likely match" | "Possible match" | "Review needed";
  reasons: string[];
  flags: string[];
  alreadyInProspects: boolean;
  searchQuery: string;
};

type FindResult = {
  seed: { id: string; name: string; country: string | null };
  queries: string[];
  industryTerms: string[];
  results: SerpResult[];
  cached_at?: string;
};

const LABEL_STYLES: Record<SerpResult["label"], string> = {
  "Likely match":   "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Possible match": "bg-amber-100 text-amber-700 border-amber-200",
  "Review needed":  "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const CONF_BAR_COLOR: Record<SerpResult["label"], string> = {
  "Likely match":   "bg-emerald-400",
  "Possible match": "bg-amber-400",
  "Review needed":  "bg-zinc-300",
};

function ConfidenceBar({ value, label }: { value: number; label: SerpResult["label"] }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full", CONF_BAR_COLOR[label])}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-[10px] font-semibold text-muted-foreground">{value}%</span>
    </div>
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
  const cacheFn = useServerFn(getLookalikeCache);
  const addFn = useServerFn(addSerpResultToQualifying);

  const [result, setResult] = useState<FindResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [cacheLoading, setCacheLoading] = useState(true);
  const [added, setAdded] = useState<Set<string>>(new Set());

  // Load cached results on mount
  useEffect(() => {
    cacheFn({ data: { companyId } })
      .then((cache) => {
        if (cache) {
          setResult({
            seed: { id: companyId, name: companyName, country: null },
            queries: cache.queries,
            industryTerms: cache.industry_terms,
            results: cache.results,
            cached_at: cache.cached_at,
          });
        }
      })
      .catch(() => {/* silently ignore cache miss */})
      .finally(() => setCacheLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const r = await findFn({ data: { companyId } });
      setResult(r as FindResult);
      if (r.results.length === 0) {
        toast.info("No lookalikes found — try enriching this prospect with industry and product info first.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const addToQualifying = useMutation({
    mutationFn: (r: SerpResult) =>
      addFn({
        data: {
          sourceCompanyId: companyId,
          name: r.name,
          domain: r.domain,
          country: result?.seed.country ?? null,
          description: r.description || null,
        },
      }),
    onSuccess: (res, r) => {
      qc.invalidateQueries({ queryKey: ["qualifying"] });
      setAdded((prev) => new Set([...prev, r.domain]));
      toast.success(res.created ? `${r.name} added to Qualifying` : "Already in Qualifying");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Searches Google for companies appearing for the same keywords as{" "}
            <span className="font-medium text-foreground">{companyName}</span>.
            Results are scored on confidence — not every SERP result is a true lookalike.
          </p>
        </div>
        <Button size="sm" onClick={run} disabled={loading} className="shrink-0">
          {loading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          )}
          {result === null ? "Find Lookalikes" : "Re-run"}
        </Button>
      </div>

      {/* Loading state */}
      {cacheLoading && !loading && (
        <div className="rounded-md border bg-muted/10 p-4 text-center text-sm text-muted-foreground animate-pulse">
          Loading saved results…
        </div>
      )}

      {loading && (
        <div className="rounded-md border bg-muted/20 p-6 text-center">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Searching Google for companies similar to {companyName}…
          </p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-3">
          {/* Queries used + last run time — transparency */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span>Searched for:</span>
            {result.queries.map((q) => (
              <span key={q} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                {q}
              </span>
            ))}
            {result.cached_at && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                Last run: {new Date(result.cached_at).toLocaleString()}
              </span>
            )}
          </div>

          {result.results.length === 0 ? (
            <div className="rounded-md border bg-muted/20 p-5 text-sm text-muted-foreground">
              No lookalikes found for these queries. Enrich{" "}
              <span className="font-medium">{companyName}</span> with industry, country, and
              product/service info to generate better search terms.
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {result.results.length} result{result.results.length !== 1 ? "s" : ""} found ·
                Confidence ≥ 65% = <span className="text-emerald-600 font-medium">Likely match</span>,
                40–64% = <span className="text-amber-600 font-medium">Possible match</span>,
                &lt; 40% = <span className="text-zinc-500 font-medium">Review needed</span>
              </p>

              <div className="divide-y rounded-md border">
                {result.results.map((r) => {
                  const isAdded = added.has(r.domain);
                  return (
                    <div key={r.domain} className="p-3 hover:bg-muted/20 transition-colors">
                      <div className="flex items-start gap-3">
                        {/* Main info */}
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-sm hover:underline"
                            >
                              {r.name}
                            </a>
                            <span
                              className={cn(
                                "rounded border px-1.5 py-0.5 text-[10px] font-semibold",
                                LABEL_STYLES[r.label],
                              )}
                            >
                              {r.label}
                            </span>
                            {r.alreadyInProspects && (
                              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 border border-blue-200">
                                In your prospects
                              </span>
                            )}
                            {isAdded && (
                              <span className="flex items-center gap-0.5 text-[10px] text-emerald-600 font-semibold">
                                <CheckCircle2 className="h-3 w-3" /> In Qualifying
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <a
                              href={`https://${r.domain}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:underline"
                            >
                              <Globe className="h-3 w-3" />
                              {r.domain}
                            </a>
                            <ConfidenceBar value={r.confidence} label={r.label} />
                          </div>

                          {r.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {r.description}
                            </p>
                          )}

                          {/* Reason chips */}
                          {r.reasons.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {r.reasons.map((reason, i) => (
                                <Badge
                                  key={i}
                                  variant="secondary"
                                  className="text-[10px] font-normal py-0 h-4"
                                >
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {/* Warning flags */}
                          {r.flags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {r.flags.map((flag, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-0.5 text-[10px] text-amber-600"
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  {flag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Action */}
                        <Button
                          size="sm"
                          variant={isAdded ? "ghost" : "outline"}
                          disabled={isAdded || addToQualifying.isPending}
                          onClick={() => addToQualifying.mutate(r)}
                          className="shrink-0 mt-0.5"
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
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
