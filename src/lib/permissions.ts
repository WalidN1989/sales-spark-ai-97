export const MODULES = {
  prospects: {
    label: "Prospects",
    tabs: {
      list: "Company list",
      add: "Add company",
      research: "AI research",
      pitch: "Pitch email",
      delete: "Delete companies",
      export: "Export data",
    },
  },
  sales: {
    label: "Sales",
    tabs: {
      upload: "Upload CSV",
      list: "Transactions",
      graph: "Sales graph",
      team: "Team analytics",
      delete: "Delete records",
      export: "Export data",
    },
  },
  meetings: {
    label: "Meetings",
    tabs: {
      scheduled: "Scheduled meetings",
      nearby: "Nearby scan",
      team: "Team meetings",
    },
  },
} as const;

export type ModuleKey = keyof typeof MODULES;

// ─── Central module registry ───────────────────────────────────────────────
// The single source of truth for every gated app module. It drives BOTH the
// sidebar and the per-user "Module access" panel in User management, so adding
// one entry here automatically:
//   • adds the module to the sidebar (gated by can()),
//   • adds a toggle for it to every user's access panel,
//   • enforces it at the route level.
//
// `defaultRep` is what a sales rep sees when no explicit permission is set.
// CONVENTION: give every NEW module `defaultRep: false` so it is hidden from
// reps until a manager explicitly grants access. `path` must match the route.
export type AppModule = { key: string; label: string; path: string; defaultRep: boolean };

export const APP_MODULES: AppModule[] = [
  { key: "prospects", label: "Prospects", path: "/app/prospects", defaultRep: false },
  { key: "qualifying", label: "Qualifying", path: "/app/qualifying", defaultRep: false },
  { key: "leads", label: "Leads", path: "/app/leads", defaultRep: true },
  { key: "tasks", label: "Tasks", path: "/app/tasks", defaultRep: true },
  { key: "inquiries", label: "Inquiries", path: "/app/inquiries", defaultRep: false },
  { key: "competitors", label: "Competitor Analysis", path: "/app/competitors", defaultRep: false },
  { key: "products", label: "Products", path: "/app/products", defaultRep: true },
  { key: "learning", label: "Learning", path: "/app/learning", defaultRep: true },
  { key: "payments", label: "Payment Follow-up", path: "/app/payments", defaultRep: false },
  { key: "sales", label: "Sales", path: "/app/sales", defaultRep: true },
  { key: "meetings", label: "Meetings", path: "/app/meetings", defaultRep: true },
  { key: "notes", label: "Notes", path: "/app/notes", defaultRep: true },
  { key: "visual_match", label: "Visual Match", path: "/app/visual-match", defaultRep: true },
  // Settings holds manager tools (company profile, import, user management), so
  // it is manager-only by default. Reps can be granted it explicitly.
  { key: "settings", label: "Settings", path: "/app/settings", defaultRep: false },
];

const MODULE_BY_KEY = new Map(APP_MODULES.map((m) => [m.key, m]));

// A module's default visibility for a sales rep with no explicit permission.
// Unknown/brand-new keys default to hidden — so nothing is exposed by accident.
export const moduleDefaultVisible = (key: string): boolean => MODULE_BY_KEY.get(key)?.defaultRep ?? false;

// Modules hidden from reps by default (shown with a "Manager" tag in the panel).
export const MANAGER_ONLY_MODULES = new Set<string>(
  APP_MODULES.filter((m) => !m.defaultRep).map((m) => m.key),
);
