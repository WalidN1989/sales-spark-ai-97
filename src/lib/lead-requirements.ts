export const LEAD_REQUIREMENTS = [
  "TNA (Time and Attendance)",
  "Access Control System",
  "Visitor Management System",
  "Meal Management System",
  "Gym Management System",
  "Other / Unclassified",
] as const;

export type LeadRequirement = (typeof LEAD_REQUIREMENTS)[number];

