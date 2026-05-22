import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUsers, setUserRole, setUserPermission, setUserStatus } from "@/lib/users.functions";
import { MODULES } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/settings/users")({
  component: UsersPage,
});

function UsersPage() {
  const list = useServerFn(listUsers);
  const setRole = useServerFn(setUserRole);
  const setPerm = useServerFn(setUserPermission);
  const setStatus = useServerFn(setUserStatus);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => list() });

  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-3">
      {(data?.users ?? []).map((u) => {
        const role = (u.roles[0] ?? "sales_rep") as "admin" | "manager" | "sales_rep";
        const permEnabled = (m: string, t: string) => {
          const p = u.permissions.find((x) => x.module === m && x.tab === t);
          return p ? p.enabled : true;
        };
        return (
          <Card key={u.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{u.full_name || u.email}</CardTitle>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Select
                    value={role}
                    onValueChange={async (v) => {
                      await setRole({ data: { user_id: u.id, role: v as typeof role } });
                      toast.success("Role updated");
                      refresh();
                    }}
                  >
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="sales_rep">Sales rep</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Active</span>
                    <Switch
                      checked={u.status === "active"}
                      onCheckedChange={async (v) => {
                        await setStatus({ data: { user_id: u.id, status: v ? "active" : "inactive" } });
                        refresh();
                      }}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible>
                <AccordionItem value="perm">
                  <AccordionTrigger className="text-sm">Module & tab permissions</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4">
                      {(Object.keys(MODULES) as (keyof typeof MODULES)[]).map((m) => {
                        const mod = MODULES[m];
                        return (
                          <div key={m} className="rounded-md border p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <div className="font-medium">{mod.label}</div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">Module</span>
                                <Switch
                                  checked={permEnabled(m, "*")}
                                  onCheckedChange={async (v) => {
                                    await setPerm({ data: { user_id: u.id, module: m, tab: "*", enabled: v } });
                                    refresh();
                                  }}
                                />
                              </div>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {Object.entries(mod.tabs).map(([tab, label]) => (
                                <label key={tab} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                                  <span>{label}</span>
                                  <Switch
                                    checked={permEnabled(m, tab)}
                                    onCheckedChange={async (v) => {
                                      await setPerm({ data: { user_id: u.id, module: m, tab, enabled: v } });
                                      refresh();
                                    }}
                                  />
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
