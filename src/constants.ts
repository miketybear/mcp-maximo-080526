// ─────────────────────────────────────────────────
// Enum constants (single source of truth)
// ─────────────────────────────────────────────────

/** Known Maximo Work Order statuses. Extend as needed for your site. */
export const WO_STATUS = ["WAPPR", "APPR", "INPRG", "SCHED", "COMP", "CLOSE", "CAN"] as const;

/** Discipline codes configured at BD POC. */
export const WO_DISCIPLINE = ["MECH", "E&I", "PROD", "RES"] as const;

/** Work type codes. */
export const WO_WORKTYPE = ["PM", "CM", "General", "PdM", "Routine"] as const;

/** Work Order priority codes. */
export const WO_PRIORITY = ["1", "2", "3", "4"] as const;
