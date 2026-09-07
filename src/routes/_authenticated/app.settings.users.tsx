import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listUsers,
  setUserRole,
  setUserPermission,
  setUserStatus,
  createTeamMember,
} from "@/lib/users.functions";
import { MODULES } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Copy, UserPlus } from "lucide-react";
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Team members</h2>
          <p className="text-xs text-muted-foreground">
            {(data?.users ?? []).length} {(data?.users ?? []).length === 1 ? "person" : "people"} · create a login for
            each staff member, then set their role and access.
          </p>
        </div>
        <AddStaffDialog onCreated={refresh} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        (data?.users ?? []).map((u) => {
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
        })
      )}
    </div>
  );
}

function AddStaffDialog({ onCreated }: { onCreated: () => void }) {
  const createFn = useServerFn(createTeamMember);
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "manager" | "sales_rep">("sales_rep");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const reset = () => {
    setFullName("");
    setEmail("");
    setPassword("");
    setRole("sales_rep");
    setCreated(null);
  };

  const submit = async () => {
    if (!email.trim()) return toast.error("Email is required");
    if (password && password.length < 8) return toast.error("Password must be at least 8 characters");
    setBusy(true);
    try {
      const res = await createFn({
        data: {
          email: email.trim(),
          full_name: fullName.trim() || undefined,
          role,
          password: password.trim() || undefined,
        },
      });
      setCreated({ email: res.email, password: res.temp_password });
      onCreated();
      toast.success("Staff login created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the login");
    } finally {
      setBusy(false);
    }
  };

  const copyCreds = () => {
    if (!created) return;
    navigator.clipboard.writeText(`Email: ${created.email}\nPassword: ${created.password}`);
    toast.success("Credentials copied");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 text-xs">
          <UserPlus className="mr-1 h-3.5 w-3.5" /> Add staff member
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add staff member</DialogTitle>
        </DialogHeader>

        {created ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Share these credentials with your staff member. This password is shown once — copy it now.
            </p>
            <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
              <div>
                <span className="text-muted-foreground">Email:</span> <span className="font-medium">{created.email}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Password:</span>{" "}
                <span className="font-mono font-medium">{created.password}</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              They sign in at the normal login page and can change their password later.
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={copyCreds}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy
              </Button>
              <Button size="sm" onClick={() => setOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={200} placeholder="e.g. Ahmed Khan" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" maxLength={200} placeholder="ahmed@etopme.ae" />
            </div>
            <div>
              <Label>Temporary password</Label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={72}
                placeholder="Leave blank to auto-generate"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                At least 8 characters. Blank = a secure one is generated and shown next.
              </p>
            </div>
            <div>
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales_rep">Sales rep — sees only work assigned to them</SelectItem>
                  <SelectItem value="manager">Manager — sees everything, assigns work</SelectItem>
                  <SelectItem value="admin">Admin — full control</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button size="sm" onClick={submit} disabled={busy}>
                {busy ? "Creating…" : "Create login"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
