import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Linkedin, Search, ExternalLink, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { hunterFindContacts, hunterImportLeads, type HunterContact } from "@/lib/hunter.functions";
import { confidenceColor } from "@/lib/leads-ui";
import { cn } from "@/lib/utils";

type FilterId = "all" | "executives" | "directors" | "managers" | "it" | "procurement" | "sales";

const FILTERS: { id: FilterId; label: string; test: (c: HunterContact) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  {
    id: "executives",
    label: "Executives",
    test: (c) =>
      /(ceo|cto|cfo|coo|cmo|chief|founder|owner|president)/i.test(
        `${c.position ?? ""} ${c.seniority ?? ""}`,
      ),
  },
  {
    id: "directors",
    label: "Directors",
    test: (c) => /(director|vp|vice president|head of)/i.test(c.position ?? ""),
  },
  { id: "managers", label: "Managers", test: (c) => /(manager|lead|supervisor)/i.test(c.position ?? "") },
  { id: "it", label: "IT", test: (c) => /(it|technology|engineering|developer|cto)/i.test(`${c.department ?? ""} ${c.position ?? ""}`) },
  {
    id: "procurement",
    label: "Procurement",
    test: (c) => /(procurement|purchasing|buyer|supply)/i.test(`${c.department ?? ""} ${c.position ?? ""}`),
  },
  { id: "sales", label: "Sales", test: (c) => /(sales|business development|bd)/i.test(`${c.department ?? ""} ${c.position ?? ""}`) },
];

export function FindContactsDialog({
  open,
  onOpenChange,
  companyId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
}) {
  const qc = useQueryClient();
  const findFn = useServerFn(hunterFindContacts);
  const importFn = useServerFn(hunterImportLeads);

  const [filter, setFilter] = useState<FilterId>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["hunter-find", companyId],
    queryFn: () => findFn({ data: { companyId } }),
    enabled: open,
    retry: false,
    staleTime: 24 * 60 * 60 * 1000, // 24h cache
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const contacts = useMemo(() => data?.contacts ?? [], [data]);
  const dupes = useMemo(() => data?.duplicates ?? {}, [data]);

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    return contacts.filter(f.test);
  }, [contacts, filter]);

  // Initialize "select all" when the contact list reference changes (i.e. new data)
  useEffect(() => {
    if (contacts.length === 0) return;
    setSelected(new Set(contacts.map((c) => c.email)));
  }, [contacts]);

  const toggle = (email: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(email)) n.delete(email);
      else n.add(email);
      return n;
    });
  };

  const allInFilterSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.email));
  const toggleSelectAll = () => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allInFilterSelected) {
        for (const c of filtered) n.delete(c.email);
      } else {
        for (const c of filtered) n.add(c.email);
      }
      return n;
    });
  };

  const importMut = useMutation({
    mutationFn: () => {
      const chosen = contacts.filter((c) => selected.has(c.email));
      return importFn({ data: { companyId, contacts: chosen } });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      if (r.created > 0) {
        toast.success(`${r.created} lead${r.created === 1 ? "" : "s"} created${r.skipped ? `, ${r.skipped} skipped (duplicates)` : ""}`);
        onOpenChange(false);
      } else {
        toast.warning(`No leads created — ${r.skipped} skipped as duplicates.`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" /> Find Contacts via Hunter.io
          </DialogTitle>
        </DialogHeader>

        {isLoading || (isFetching && contacts.length === 0) ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Searching Hunter…</div>
        ) : error ? (
          <div className="py-6 space-y-3">
            <p className="text-sm text-rose-600">{(error as Error).message}</p>
            <Button variant="outline" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : contacts.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No contacts found for this domain.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filter === f.id
                      ? "bg-foreground text-background border-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {f.label}
                </button>
              ))}
              <div className="ml-auto">
                <Button variant="outline" size="sm" onClick={toggleSelectAll} className="h-7 text-xs">
                  {allInFilterSelected ? (
                    <><Square className="mr-1 h-3 w-3" /> Deselect all</>
                  ) : (
                    <><CheckSquare className="mr-1 h-3 w-3" /> Select all</>
                  )}
                </Button>
              </div>
            </div>

            <div className="max-h-[55vh] overflow-y-auto rounded border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="w-8 p-2"></th>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Title</th>
                    <th className="p-2 text-left">Email</th>
                    <th className="p-2 text-left">Conf.</th>
                    <th className="w-8 p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const dup = dupes[c.email];
                    return (
                      <tr key={c.email} className="border-t">
                        <td className="p-2">
                          <Checkbox
                            checked={selected.has(c.email)}
                            onCheckedChange={() => toggle(c.email)}
                          />
                        </td>
                        <td className="p-2">
                          <div className="font-medium">{c.full_name}</div>
                          {c.department && (
                            <div className="text-xs text-muted-foreground">{c.department}</div>
                          )}
                          {dup && (
                            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                              Possible existing lead
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-xs">{c.position ?? "—"}</td>
                        <td className="p-2 text-xs">{c.email}</td>
                        <td className="p-2">
                          {c.confidence != null && (
                            <span
                              className={cn(
                                "rounded px-2 py-0.5 text-[10px] font-bold",
                                confidenceColor(c.confidence),
                              )}
                            >
                              {c.confidence}%
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          {c.linkedin && (
                            <a
                              href={c.linkedin}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="LinkedIn"
                            >
                              <Linkedin className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <DialogFooter className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {selected.size} of {filtered.length} selected
                {data?.organization?.organization && (
                  <>
                    {" · "}
                    <a
                      href={data.organization.linkedin ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 hover:underline"
                    >
                      {data.organization.organization}
                      {data.organization.linkedin && <ExternalLink className="h-3 w-3" />}
                    </a>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
                  {isFetching ? "Refreshing…" : "Refresh"}
                </Button>
                <Button
                  onClick={() => importMut.mutate()}
                  disabled={selected.size === 0 || importMut.isPending}
                >
                  {importMut.isPending ? "Importing…" : `Import ${selected.size} as Lead${selected.size === 1 ? "" : "s"}`}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
