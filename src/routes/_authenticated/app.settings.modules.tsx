import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, EyeOff, FlaskConical, LayoutGrid, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { APP_MODULES } from "@/lib/permissions";
import { getHiddenModules, setModuleHidden } from "@/lib/module-visibility.functions";

export const Route = createFileRoute("/_authenticated/app/settings/modules")({
  head: () => ({ meta: [{ title: "Hidden modules — Sales Insights" }] }),
  component: ModuleVisibilitySettings,
});

function ModuleVisibilitySettings() {
  const getFn = useServerFn(getHiddenModules);
  const setFn = useServerFn(setModuleHidden);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["hidden-modules"],
    queryFn: () => getFn(),
  });
  const hidden = new Set(data?.hiddenModules ?? []);
  const mutation = useMutation({
    mutationFn: (input: { module: string; hidden: boolean }) => setFn({ data: input }),
    onSuccess: (result) => {
      queryClient.setQueryData(["hidden-modules"], result);
      queryClient.invalidateQueries({ queryKey: ["my-access"] });
      toast.success("Module visibility updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const modules = APP_MODULES.filter((module) => module.key !== "settings");

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-sky-50 p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Private module workspace</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Hide experiments and unfinished modules from every staff sidebar. Staff cannot open a
              hidden module directly. Administrators can always open it privately from this page.
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <LayoutGrid className="h-4 w-4 text-violet-600" /> Module visibility
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Switch on “Hidden” for any module you want to keep private.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            Admin only
          </span>
        </div>

        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Loading module visibility…
          </p>
        ) : (
          <div className="divide-y">
            {modules.map((module) => {
              const isHidden = hidden.has(module.key);
              return (
                <div key={module.key} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${isHidden ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
                  >
                    {isHidden ? <EyeOff className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                  </span>
                  <div className="min-w-44 flex-1">
                    <p className="text-sm font-semibold">{module.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {isHidden
                        ? "Private · hidden from staff navigation"
                        : "Visible according to each user’s access"}
                    </p>
                  </div>
                  <Link
                    to={module.path}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-3 text-xs font-medium hover:bg-accent"
                  >
                    Open module <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                  {module.key === "reception" && (
                    <Link
                      to="/app/reception-lab"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 text-xs font-medium text-violet-700 hover:bg-violet-100"
                    >
                      <FlaskConical className="h-3.5 w-3.5" /> Sinhala Lab
                    </Link>
                  )}
                  <label className="flex w-24 items-center justify-end gap-2 text-xs font-medium">
                    Hidden
                    <Switch
                      checked={isHidden}
                      disabled={mutation.isPending}
                      onCheckedChange={(checked) =>
                        mutation.mutate({ module: module.key, hidden: checked })
                      }
                    />
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Settings remains visible so you cannot accidentally lock yourself out. Existing data and
        integrations are unaffected when a module is hidden.
      </p>
    </div>
  );
}
