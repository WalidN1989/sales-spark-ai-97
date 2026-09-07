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
