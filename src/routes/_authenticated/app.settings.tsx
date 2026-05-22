import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useAccess } from "@/hooks/use-access";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Settings — Sales Insights" }] }),
  component: SettingsLayout,
});

function SettingsLayout() {
  const { isAdmin } = useAccess();
  const loc = useLocation();
  const tabs = [
    { to: "/app/settings/my-company", label: "My company" },
    ...(isAdmin ? [{ to: "/app/settings/users", label: "User management" }] : []),
  ];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </div>
      <div className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => {
          const active = loc.pathname === t.to;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "border-b-2 px-3 py-2 text-sm transition-colors",
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
