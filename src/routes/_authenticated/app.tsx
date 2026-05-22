import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { Users, BarChart3, MapPin, Settings, LogOut, Menu, Briefcase } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAccess } from "@/hooks/use-access";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppShell,
});

function AppShell() {
  const { isAdmin, can } = useAccess();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const nav = [
    { to: "/app/prospects", label: "Prospects", icon: Users, show: can("prospects") },
    { to: "/app/sales", label: "Sales", icon: BarChart3, show: can("sales") },
    { to: "/app/meetings", label: "Meetings", icon: MapPin, show: can("meetings") },
    { to: "/app/settings/my-company", label: "Settings", icon: Settings, show: true },
  ].filter((n) => n.show);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <nav className="flex flex-col gap-1">
      {nav.map((n) => {
        const Icon = n.icon;
        const active = location.pathname.startsWith(n.to.replace("/my-company", ""));
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onClick}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            <Icon className="h-4 w-4" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-muted/20">
      {/* Sidebar - desktop */}
      <aside className="hidden w-64 flex-col border-r bg-card p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <Briefcase className="h-5 w-5 text-primary" />
          <span className="font-semibold">Sales Insights</span>
        </div>
        <NavLinks />
        <div className="mt-auto pt-4">
          {isAdmin && <p className="px-3 pb-2 text-xs text-muted-foreground">Admin</p>}
          <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            <span className="font-semibold">Sales Insights</span>
          </div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64">
              <div className="mt-6">
                <NavLinks onClick={() => setOpen(false)} />
                <Button variant="ghost" className="mt-4 w-full justify-start" onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
