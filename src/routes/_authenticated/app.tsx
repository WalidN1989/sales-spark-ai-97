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
  FileText,
  Layers,
  StickyNote,
  Target,
  Camera,
  Search,
  Swords,
  Wallet,
  ListChecks,
  TrendingUp,
  Crosshair,
  MessageCircle,
  Headphones,
  Mail,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAccess } from "@/hooks/use-access";
import { APP_MODULES } from "@/lib/permissions";
import { NotificationCenter } from "@/components/reminders/NotificationCenter";
import { APP_HEADER_SLOT_ID, HeaderActionsContext } from "@/components/layout/HeaderPortal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppShell,
});

function AppShell() {
  const { isAdmin, can, isModuleHidden, isLoading: accessLoading } = useAccess();
  const navigate = useNavigate();
  const location = useLocation();

  // Route-level enforcement: if the current page belongs to a module this user
  // can't access (e.g. a rep typing the URL of a hidden module), bounce them to
  // the first module they can see. RLS already blocks the data; this keeps them
  // out of the empty page too.
  useEffect(() => {
    if (accessLoading) return;
    const mod = APP_MODULES.find((m) => location.pathname.startsWith(m.path));
    if (mod && !can(mod.key)) {
      // Send them to the first module they can access. If somehow none, stay put
      // rather than risk a redirect loop.
      const landing = APP_MODULES.find((m) => can(m.key))?.path;
      if (landing && !location.pathname.startsWith(landing)) navigate({ to: landing });
    }
    // `can` is stable per access-data load; re-run on path or load changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, accessLoading]);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState(false);
  // Detail pages hide the search + bell to keep the profile UI uncluttered.
  const [hideActions, setHideActions] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("sidebar:collapsed") === "1");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem("sidebar:collapsed", collapsed ? "1" : "0");
  }, [collapsed, hydrated]);

  const nav = [
    { to: "/app/prospects", label: "Prospects", icon: Users, show: can("prospects") },
    { to: "/app/qualifying", label: "Qualifying", icon: Target, show: can("qualifying") },
    { to: "/app/leads", label: "Leads", icon: Flame, show: can("leads") },
    { to: "/app/reception", label: "Reception", icon: Headphones, show: can("reception") },
    { to: "/app/whatsapp", label: "WhatsApp", icon: MessageCircle, show: can("whatsapp") },
    { to: "/app/email", label: "Email", icon: Mail, show: can("email") },
    { to: "/app/forecast", label: "Forecast", icon: TrendingUp, show: can("forecast") },
    { to: "/app/tasks", label: "Tasks", icon: ListChecks, show: can("tasks") },
    { to: "/app/inquiries", label: "Inquiries", icon: Layers, show: can("inquiries") },
    { to: "/app/competitors", label: "Competitor Analysis", icon: Swords, show: can("competitors") },
    { to: "/app/icp", label: "Product ICP", icon: Crosshair, show: can("icp") },
    { to: "/app/products", label: "Products", icon: Package, show: can("products") },
    { to: "/app/quotations", label: "Quotations", icon: FileText, show: can("quotations") },
    { to: "/app/learning", label: "Learning", icon: GraduationCap, show: can("learning") },
    { to: "/app/payments", label: "Payment Follow-up", icon: Wallet, show: can("payments") },
    { to: "/app/sales", label: "Sales", icon: BarChart3, show: can("sales") },
    { to: "/app/meetings", label: "Meetings", icon: MapPin, show: can("meetings") },
    { to: "/app/notes", label: "Notes", icon: StickyNote, show: can("notes") },
    { to: "/app/visual-match", label: "Visual Match", icon: Camera, show: can("visual_match") },
    { to: "/app/settings/my-company", label: "Settings", icon: Settings, show: can("settings") },
  ].filter((n) => n.show && !APP_MODULES.some((module) => module.path === n.to && isModuleHidden(module.key)));

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const NavLinks = ({
    onClick,
    iconOnly = false,
    settingsOnly = false,
  }: {
    onClick?: () => void;
    iconOnly?: boolean;
    settingsOnly?: boolean;
  }) => (
    <nav aria-label={settingsOnly ? "Settings" : "Main navigation"} className="flex flex-col gap-0.5">
      {nav.filter((n) => n.to.startsWith("/app/settings") === settingsOnly).map((n) => {
        const Icon = n.icon;
        const active = location.pathname.startsWith(n.to.replace("/my-company", ""));
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onClick}
            title={iconOnly ? n.label : undefined}
            className={cn(
              "flex h-7 shrink-0 items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors",
              iconOnly ? "justify-center px-2" : "px-2.5",
              active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!iconOnly && n.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <HeaderActionsContext.Provider value={setHideActions}>
    <div className="flex h-dvh overflow-hidden bg-muted/20">
      {/* Sidebar - desktop */}
      <aside
        className={cn(
          "hidden min-h-0 shrink-0 flex-col border-r bg-card p-2 md:flex transition-[width] duration-200",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div
          className={cn(
            "mb-2 flex shrink-0 items-center gap-2",
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain"><NavLinks iconOnly={collapsed} /></div>
        <div className="mt-2 shrink-0 border-t pt-2"><NavLinks iconOnly={collapsed} settingsOnly />
          {isAdmin && !collapsed && (
            <p className="px-2.5 pt-1 text-[10px] text-muted-foreground">Admin</p>
          )}
          <Button
            variant="ghost"
            className={cn("h-7 w-full text-[13px]", collapsed ? "justify-center px-0" : "justify-start")}
            onClick={signOut}
            title={collapsed ? "Sign out" : undefined}
          >
            <LogOut className={cn("h-4 w-4", !collapsed && "mr-2")} />
            {!collapsed && "Sign out"}
          </Button>
        </div>
      </aside>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* One primary header: page content (via portal) + global actions */}
        <header className="flex shrink-0 items-center gap-2 border-b bg-card px-3 py-2 md:px-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0 md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-64 flex-col overflow-hidden">
              <div className="mt-6 flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain"><NavLinks onClick={() => setOpen(false)} /></div><div className="mt-2 shrink-0 border-t pt-2"><NavLinks onClick={() => setOpen(false)} settingsOnly /></div>
                <Button variant="ghost" className="h-8 w-full shrink-0 justify-start" onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Pages render their title / search / actions here */}
          <div id={APP_HEADER_SLOT_ID} className="flex min-w-0 flex-1 items-center gap-2" />

          {!hideActions && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                title="Search (Ctrl+K)"
                onClick={() => window.dispatchEvent(new CustomEvent("shortcut:open-search"))}
              >
                <Search className="h-4 w-4" />
              </Button>
              <NotificationCenter />
            </>
          )}
        </header>

        <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
    </HeaderActionsContext.Provider>
  );
}
