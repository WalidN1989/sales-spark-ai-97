import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import {
  Users,
  BarChart3,
  MapPin,
  Settings,
  LogOut,
  Menu,
  Briefcase,
  Flame,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Package,
  Layers,
  StickyNote,
} from "lucide-react";
import { useEffect, useState } from "react";
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
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("sidebar:collapsed") === "1");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem("sidebar:collapsed", collapsed ? "1" : "0");
  }, [collapsed, hydrated]);

  const nav = [
    { to: "/app/prospects", label: "Prospects", icon: Users, show: can("prospects") },
    { to: "/app/leads", label: "Leads", icon: Flame, show: can("prospects") },
    { to: "/app/inquiries", label: "Inquiries", icon: Layers, show: can("prospects") },
    { to: "/app/products", label: "Products", icon: Package, show: true },
    { to: "/app/learning", label: "Learning", icon: GraduationCap, show: true },
    { to: "/app/sales", label: "Sales", icon: BarChart3, show: can("sales") },
    { to: "/app/meetings", label: "Meetings", icon: MapPin, show: can("meetings") },
    { to: "/app/notes", label: "Notes", icon: StickyNote, show: true },
    { to: "/app/settings/my-company", label: "Settings", icon: Settings, show: true },
  ].filter((n) => n.show);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const NavLinks = ({
    onClick,
    iconOnly = false,
  }: {
    onClick?: () => void;
    iconOnly?: boolean;
  }) => (
    <nav className="flex flex-col gap-1">
      {nav.map((n) => {
        const Icon = n.icon;
        const active = location.pathname.startsWith(n.to.replace("/my-company", ""));
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onClick}
            title={iconOnly ? n.label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md text-sm font-medium transition-colors",
              iconOnly ? "justify-center px-2 py-2" : "px-3 py-2",
              active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            <Icon className="h-4 w-4" />
            {!iconOnly && n.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-muted/20">
      {/* Sidebar - desktop */}
      <aside
        className={cn(
          "hidden flex-col border-r bg-card p-3 md:flex transition-[width] duration-200",
          collapsed ? "w-16" : "w-64 p-4",
        )}
      >
        <div
          className={cn(
            "mb-6 flex items-center gap-2",
            collapsed ? "justify-center px-0" : "px-2 justify-between",
          )}
        >
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <Briefcase className="h-5 w-5 text-primary shrink-0" />
              <span className="font-semibold truncate">Sales Insights</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="h-8 w-8"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
        <NavLinks iconOnly={collapsed} />
        <div className="mt-auto pt-4">
          {isAdmin && !collapsed && (
            <p className="px-3 pb-2 text-xs text-muted-foreground">Admin</p>
          )}
          <Button
            variant="ghost"
            className={cn("w-full", collapsed ? "justify-center px-0" : "justify-start")}
            onClick={signOut}
            title={collapsed ? "Sign out" : undefined}
          >
            <LogOut className={cn("h-4 w-4", !collapsed && "mr-2")} />
            {!collapsed && "Sign out"}
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
