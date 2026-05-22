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
