// ─────────────────────────────────────────────────
// Enum constants (single source of truth)
// ─────────────────────────────────────────────────

/**
 * Known Maximo Work Order statuses (CAN is intentionally omitted — cancelled
 * work orders must never be requested or returned).
 *
 * Completion boundary:
 *   NOT completed → WAPPR | APPR | SCHED | INPRG | WMATL
 *   Completed     → CHKCOMP | COMP | CLOSE
 *
 * Status details:
 *   WAPPR   – Waiting for Approval (created, not yet approved)
 *   APPR    – Approved (ready to be scheduled/executed)
 *   INPRG   – In Progress (work has started)
 *   SCHED   – Scheduled (approved and assigned a schedule slot)
 *   WMATL   – Waiting for Materials (approved but blocked on parts/materials)
 *   CHKCOMP – Check Completion (pending final inspection before closing)
 *   COMP    – Completed (work finished, awaiting close)
 *   CLOSE   – Closed (fully processed and closed)
 */
export const WO_STATUS = ["WAPPR", "APPR", "INPRG", "SCHED", "WMATL", "CHKCOMP", "COMP", "CLOSE"] as const;

/**
 * Discipline (team) codes at BD POC.
 *   MECH  – Mechanical team
 *   E&I   – Electrical & Instrumentation team
 *   PROD  – Production / Operations team
 *   RES   – Rotating Equipment / Reliability team
 */
export const WO_DISCIPLINE = ["MECH", "E&I", "PROD", "RES"] as const;

/**
 * Work type codes.
 *   PM      – Preventive (Planned) Maintenance — scheduled recurring tasks
 *   CM      – Corrective Maintenance — reactive repairs after a failure
 *   General – General / ad-hoc work orders not classified as PM or CM
 *   PdM     – Predictive Maintenance — condition-based inspections
 *   Routine – Routine operational checks or housekeeping tasks
 */
export const WO_WORKTYPE = ["PM", "CM", "General", "PdM", "Routine"] as const;

/**
 * Work Order priority levels (numeric 1–4).
 *   1 – Low
 *   2 – Medium
 *   3 – High
 *   4 – Urgent (highest)
 */
export const WO_PRIORITY = ["1", "2", "3", "4"] as const;

/**
 * Known Maximo Purchase Order statuses.
 * CAN is intentionally excluded — tools must never filter or return CAN POs.
 */
export const PO_STATUS = ["WAPPR", "APPR", "INPRG", "WREVCC", "WTECHMGR", "CLOSE"] as const;

/** Purchase Order types. */
export const PO_TYPE = ["STD", "REL"] as const;

/**
 * Action Tracking (Oil) statuses (REP_PLUSGACT). CAN is intentionally omitted.
 *   WAPPR      – Waiting on approval
 *   INPROGRESS – PIC in progress
 *   ACTTLRET   – Returned by team lead to the PIC
 *   ACTWCLOSE  – Agreed, waiting for close-out
 *   CLOSE      – Closed
 */
export const ACT_STATUS = ["WAPPR", "INPROGRESS", "ACTTLRET", "ACTWCLOSE", "CLOSE"] as const;
/** Action statuses counted as still open. */
export const ACT_OPEN_STATUS = ["WAPPR", "INPROGRESS", "ACTTLRET", "ACTWCLOSE"] as const;

/**
 * Investigation (Oil) statuses (REP_PLUSGINV). CANCELED is intentionally omitted.
 *   NEW      – New
 *   RIRTLEAD – Review investigation results (team lead)
 *   WRTL    – Final review / approval of technical report
 *   WCLOSED – Waiting closed
 *   CLOSED  – Closed
 */
export const INV_STATUS = ["NEW", "RIRTLEAD", "WRTL", "WCLOSED", "CLOSED"] as const;

/** Readable labels for action statuses (Maximo's own descriptions are cryptic, e.g. "Change Action tracking status to ACTTLRET"). */
export const ACT_STATUS_LABEL: Record<string, string> = {
  WAPPR: "Waiting approval",
  INPROGRESS: "PIC in progress",
  ACTTLRET: "Returned to PIC by team lead",
  ACTWCLOSE: "Agreed, waiting for close-out",
  CLOSE: "Closed",
};

/** Readable labels for investigation statuses. */
export const INV_STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  RIRTLEAD: "Review investigation results",
  WRTL: "Final review / approval of technical report",
  WCLOSED: "Waiting closed",
  CLOSED: "Closed",
};
