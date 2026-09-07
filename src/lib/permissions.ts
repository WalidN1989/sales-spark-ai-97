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

// Modules that belong to the manager/owner. A sales rep does NOT see these in
// the sidebar by default — their view stays focused on the leads assigned to
// them. A manager always sees them; a manager can still grant an individual rep
// access by enabling that module for them in User management (an explicit
// permission overrides this default). Managers/admins bypass it entirely.
export const MANAGER_ONLY_MODULES = new Set<string>([
  "prospects",
  "qualifying",
  "inquiries",
  "competitors",
  "payments",
]);

// The permission-gated sidebar modules, in display order — drives the per-user
// "Module access" panel in User management. (Products, Learning, Notes and
// Visual Match are always visible and intentionally not listed.)
export const NAV_MODULES: { key: string; label: string }[] = [
  { key: "prospects", label: "Prospects" },
  { key: "qualifying", label: "Qualifying" },
  { key: "leads", label: "Leads" },
  { key: "inquiries", label: "Inquiries" },
  { key: "competitors", label: "Competitor Analysis" },
  { key: "payments", label: "Payment Follow-up" },
  { key: "sales", label: "Sales" },
  { key: "meetings", label: "Meetings" },
];

// A module's default visibility for a sales rep when no explicit permission row
// exists: manager-only modules default off, everything else defaults on.
export const moduleDefaultVisible = (key: string): boolean => !MANAGER_ONLY_MODULES.has(key);
