import type { z } from "zod";
import { config } from "./config.js";
import { ACT_OPEN_STATUS, ACT_STATUS_LABEL, INV_STATUS_LABEL } from "./constants.js";
import type {
  SearchWorkOrdersInput, WorkOrderCollection, MultiAssetRow,
  SearchPurchaseOrdersInput, SearchPurchaseOrdersByBudgetInput, PurchaseOrderCollection, PurchaseOrder,
  SearchVendorInput, VendorCollection,
  GetBudgetCodeInput, BudgetCodeCollection,
  ExchangeRateLookupResult,
  SearchLocationsInput, GetLocationChildrenInput, GetLocationAncestorsInput, ListLocationSystemsInput,
  LocHierarchyRow, LocHierarchyCollection, LocationNode, LocationAttrs,
  ActionFilter, SearchActionTrackingInput, SummarizeActionTrackingInput, GetActionTrackingInput,
  ListActionsByInvestigationInput, SearchInvestigationsInput, GetInvestigationInput, MaximoRow, RelatedRecord,
} from "./types/index.js";
import {
  WorkOrderCollectionSchema,
  PurchaseOrderCollectionSchema,
  VendorCollectionSchema,
  BudgetCodeCollectionSchema,
  ExchangeRateCollectionSchema,
  LocHierarchyCollectionSchema,
  LocSystemCollectionSchema,
  OperLocCollectionSchema,
  RowCollectionSchema,
} from "./types/index.js";

// ─────────────────────────────────────────────────
// OSLC query helpers
// ─────────────────────────────────────────────────

/**
 * Quote a user-supplied value for use inside an `oslc.where` clause.
 * Double quotes are stripped so a value can never close the literal and
 * inject extra conditions (none of the Maximo codes we query contain them).
 */
const q = (value: string | number) => `"${String(value).replace(/"/g, "")}"`;
/** Quoted CONTAINS (LIKE) pattern: `"%value%"`. */
const like = (value: string) => q(`%${value}%`);

interface OslcQuery {
  /** Conditions joined with " and "; falsy entries are skipped. */
  where?: (string | false | undefined)[];
  select: string;
  orderBy?: string;
  limit?: number;
  pageno?: number;
  /** Full-text search (`oslc.searchTerms`) over `searchAttributes`. */
  search?: { terms: string; attributes: string };
}

/** Shared list of selected work order attributes for OSLC queries. */
const WO_SELECT_FIELDS = "wonum,parent,description,status,woclass,location,bdpocdiscipline,worktype,plusgsafetycrit,plusgcomcrit";
/** Extended select list (used by getWorkOrder). */
const WO_SELECT_FIELDS_DETAIL = `${WO_SELECT_FIELDS},reportdate,assetnum,schedstart,schedfinish,actstart,actfinish,estdur,wopriority,siteid,description_longdescription`;

/** mxapilocation root is LOCHIERARCHY; tag attributes live in the nested LOCATIONS record. */
const LOC_ATTR_FIELDS = "description,status,bdpocloctype,bdpoclocfunction,bdpoclocgroup,plusgpandidnumber,plusgsafetycrit,plusgcomcrit";
const LOC_SELECT_FIELDS = `location,parent,systemid,children,locations{${LOC_ATTR_FIELDS}}`;
/** Exact match, or `"(blank)"` (as returned by groupBy) → attribute is null (OSLC `!="*"`). */
const eqOrBlank = (col: string, value: string) => (value === "(blank)" ? `${col}!="*"` : `${col}=${q(value)}`);

/** groupBy option → LOCATIONS column. */
const LOC_GROUP_COLUMNS = {
  locType: "bdpocloctype",
  locFunction: "bdpoclocfunction",
  sceGroup: "bdpoclocgroup",
  status: "status",
  sce: "plusgsafetycrit",
  pce: "plusgcomcrit",
} as const;

/** Legend returned with every rendered tree. */
const TREE_LEGEND = "🔴 SCE <group> = Safety Critical Element · 🟡 PCE = Production Critical Element · ▸ = has more children (call get_location_children on it)";
/** Safety cap for get_location_ancestors (one Maximo request per level). */
const LOC_MAX_ANCESTOR_LEVELS = 12;

/** Tag attributes shared by every location node (LOCATIONS record). */
function locAttributes(loc: LocationAttrs) {
  return {
    description: loc.description ?? undefined,
    status: loc.status ?? undefined,
    locType: loc.bdpocloctype ?? undefined,
    locFunction: loc.bdpoclocfunction ?? undefined,
    pidNumber: loc.plusgpandidnumber ?? undefined,
    sce: loc.plusgsafetycrit ?? false,
    sceGroup: loc.bdpoclocgroup ?? undefined,
    sceGroupDescription: loc.bdpoclocgroup_description ?? undefined,
    pce: loc.plusgcomcrit ?? false,
    critical: criticalLabel(loc),
  };
}

/**
 * Colour markers for critical tags. Chat clients (Claude, ChatGPT, Copilot) render Markdown
 * without text colour — HTML/LaTeX colour is stripped or shown raw — so colour is carried by
 * emoji, which keep the same colour and contrast on light and dark themes.
 */
const SCE_MARK = "🔴"; // red    = Safety Critical Element
const PCE_MARK = "🟡"; // yellow = Production Critical Element

/**
 * Highlight label for SCE / PCE tags, e.g. "🔴 SCE (BD-SD001 Emergency Shutdown System) · 🟡 PCE".
 * Undefined for non-critical tags so the LLM can spot critical ones at a glance.
 */
function criticalLabel(loc: LocationAttrs): string | undefined {
  const parts: string[] = [];
  if (loc.plusgsafetycrit) {
    const group = [loc.bdpoclocgroup, loc.bdpoclocgroup_description].filter(Boolean).join(" ");
    parts.push(`${SCE_MARK} SCE${group ? ` (${group})` : ""}`);
  }
  if (loc.plusgcomcrit) parts.push(`${PCE_MARK} PCE`);
  return parts.length ? parts.join(" · ") : undefined;
}

/** Short marker at the end of a tree line: "🔴 SCE BD-SD001 🟡 PCE". */
function treeMarker(n: LocationNode): string {
  return [
    n.sce && `${SCE_MARK} SCE${n.sceGroup ? ` ${n.sceGroup}` : ""}`,
    n.pce && `${PCE_MARK} PCE`,
  ].filter(Boolean).join(" ");
}

function treeLine(n: LocationNode): string {
  const marker = treeMarker(n);
  const status = n.status && n.status !== "OPERATING" ? ` (${n.status})` : "";
  return [n.location, n.description && `— ${n.description}`, marker && ` ${marker}`]
    .filter(Boolean).join(" ").replace(/  +/g, " ") + status;
}

/** Render a location tree as box-drawing text (├── / └──) for direct display. */
function renderTree(root: LocationNode): string {
  const lines = [treeLine(root)];
  const walk = (node: LocationNode, prefix: string) => {
    const kids = node.children ?? [];
    kids.forEach((c, i) => {
      const last = i === kids.length - 1;
      const more = c.hasChildren && !c.children ? " ▸" : "";
      lines.push(`${prefix}${last ? "└── " : "├── "}${treeLine(c)}${more}`);
      walk(c, prefix + (last ? "    " : "│   "));
    });
    if (node.childrenTruncated) lines.push(`${prefix}└── … (more children not shown)`);
  };
  walk(root, "");
  return lines.join("\n");
}

/** Flatten a LOCHIERARCHY row into the node shape returned by location tools. */
function toLocationNode(row: LocHierarchyRow): LocationNode {
  return {
    location: row.location,
    parent: row.parent,
    systemid: row.systemid,
    ...locAttributes(row.locations?.[0] ?? {}),
    hasChildren: row.children,
  };
}

/** Keep only the paging counters (drop long hrefs) for location tool responses. */
function pagingInfo(info?: { totalCount?: number; totalPages?: number; pagenum?: number }) {
  return { totalCount: info?.totalCount, totalPages: info?.totalPages, pagenum: info?.pagenum };
}

/** Purchase order statuses considered "approved" when picking the latest revision. */
const PO_APPROVED_STATUSES = ["APPR", "INPRG", "CLOSE"];

/** Keep one record per PONUM: the latest approved revision, else the latest revision. */
function filterLatestApprovedRevisions(pos: PurchaseOrder[]): PurchaseOrder[] {
  const groups = new Map<string, PurchaseOrder[]>();
  for (const po of pos) {
    if (!po.ponum) continue;
    const list = groups.get(po.ponum) ?? [];
    list.push(po);
    groups.set(po.ponum, list);
  }

  return [...groups.values()].map((revisions) => {
    revisions.sort((a, b) => (b.revisionnum ?? 0) - (a.revisionnum ?? 0));
    return revisions.find((r) => r.status && PO_APPROVED_STATUSES.includes(r.status)) ?? revisions[0];
  });
}

// ─────────────────────────────────────────────────
// Action Tracking (REP_PLUSGACT) / Investigation (REP_PLUSGINV) helpers
// ─────────────────────────────────────────────────

const ACT_OS = "rep_plusgact";
const INV_OS = "rep_plusginv";
const RELATED_SELECT = "rel.relatedrecord{relatedreckey,relatedrecclass,relatetype,relatedrecwonum}";

const ACT_LIST_FIELDS =
  "wonum,hse_acttrack_num,description,status,hse_act_pic,hse_act_tl,hse_act_deadline,targcompdate," +
  "location,bdpocdiscipline,hse_plusgincidentgroup,hse_plusginctype,origrecordid,reportdate,actfinish";
const ACT_DETAIL_FIELDS =
  `${ACT_LIST_FIELDS},plusgactionsumm,hse_further_act,hse_root_causes,hse_sub_cause,hse_related_rc,assetnum,failurecode,` +
  "reportedby,plusgsafmtgenteredbyname,statusdate,actstart,plusgactiontype,plusgactionprior,actcategory,plusgagreedby,reviewer," +
  `description_longdescription,${RELATED_SELECT}`;

const INV_LIST_FIELDS =
  "ticketid,hse_reportnumber,description,status,location,bdpocdiscipline,plusgincidentgroup,plusginctype," +
  "plusginvestlead,hse_facility,hse_psd_type,failurecode,reportdate,affecteddate";
const INV_DETAIL_FIELDS =
  `${INV_LIST_FIELDS},hse_rca_rcfa_num,hse_tech_reportnum,assetnum,reportedby,statusdate,hse_inv_startdate,hse_not_comp_date,` +
  "hse_conseq_event,hse_finding,hse_leftasfound,hse_rca_conduct,hse_rca_recommend,plusgfailmechrem,plusgfailsubdivrem," +
  "problemcode,fr1code,fr2code,plusgdetectionmethod,plusgbarrierfail,plusghardfailmode,hse_rca_repeat_fair_type," +
  "hse_duration_shutdown,hse_production_loss,hse_productionimpactcost,hse_lesson_creator,hse_lesson_date," +
  `plusgmicode,plusgitemnum,description_longdescription,${RELATED_SELECT}`;

/** groupBy option → REP_PLUSGACT column. */
const ACT_GROUP_COLUMNS = {
  status: "status",
  pic: "hse_act_pic",
  teamLead: "hse_act_tl",
  discipline: "bdpocdiscipline",
  incidentGroup: "hse_plusgincidentgroup",
  severity: "hse_plusginctype",
  location: "location",
  subCause: "hse_sub_cause",
} as const;

/** groupBy option → REP_PLUSGINV column. */
const INV_GROUP_COLUMNS = {
  status: "status",
  discipline: "bdpocdiscipline",
  incidentGroup: "plusgincidentgroup",
  severity: "plusginctype",
  investLead: "plusginvestlead",
  facility: "hse_facility",
  location: "location",
  failureCode: "failurecode",
  problemCode: "problemcode",
} as const;

/** Maximo server time zone (Vietnam). */
const MAXIMO_TZ = "+07:00";

/** Normalise a user date ("2025-01-01" or full ISO) into an OSLC datetime literal. */
function oslcDate(value: string): string {
  const v = value.trim();
  return q(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00${MAXIMO_TZ}` : v);
}

/** Current time (or now + days) as an OSLC datetime literal in Maximo's time zone. */
function oslcNow(addDays = 0): string {
  const t = new Date(Date.now() + addDays * 86_400_000 + 7 * 3_600_000); // shift to +07:00 wall clock
  return q(`${t.toISOString().slice(0, 19)}${MAXIMO_TZ}`);
}

/**
 * Report numbers embed the ticket/wo key as the last segment:
 * ACT-2026-09-09-H14323957, INV-2023-03-21-H131006, RCA-..., TR-... → the key.
 */
function recordKey(id: string): string {
  const v = id.trim().toUpperCase();
  return v.includes("-") ? v.slice(v.lastIndexOf("-") + 1) : v;
}

const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);

/** Columns searched by the free-text `query` (OSLC where has no OR, so oslc.searchTerms is used). */
const ACT_SEARCH_ATTRS = "description,plusgactionsumm,hse_further_act,hse_root_causes";
const INV_SEARCH_ATTRS = "description,hse_finding,hse_conseq_event";

const searchOf = (terms: string | undefined, attributes: string) => (terms ? { terms, attributes } : undefined);

function actionDeadline(row: MaximoRow): string | undefined {
  return str(row.hse_act_deadline) ?? str(row.targcompdate);
}

function isOpenAction(status: unknown): boolean {
  return (ACT_OPEN_STATUS as readonly string[]).includes(String(status));
}

/** Investigation the action came from: ORIGINATOR related record, else origrecordid. */
function originatingInvestigation(row: MaximoRow): string | undefined {
  const rel = row.relatedrecord?.find((r) => r.relatedrecclass === "INVESTIGATION" && r.relatetype === "ORIGINATOR");
  return rel?.relatedreckey ?? str(row.origrecordid);
}

/** Flatten a REP_PLUSGACT row into the shape returned by action tools. */
function toAction(row: MaximoRow, detail = false) {
  const deadline = actionDeadline(row);
  const open = isOpenAction(row.status);
  const base = {
    wonum: row.wonum,
    actionNumber: row.hse_acttrack_num,
    description: row.description,
    status: row.status,
    statusDescription: ACT_STATUS_LABEL[String(row.status)] ?? row.status_description,
    pic: row.hse_act_pic,
    teamLead: row.hse_act_tl,
    deadline,
    overdue: open && deadline !== undefined && new Date(deadline).getTime() < Date.now() ? true : undefined,
    location: row.location,
    discipline: row.bdpocdiscipline,
    incidentGroup: row.hse_plusgincidentgroup,
    severity: row.hse_plusginctype,
    investigationId: originatingInvestigation(row),
    reportDate: row.reportdate,
    completedDate: row.actfinish,
  };
  if (!detail) return base;
  return {
    ...base,
    actionSummary: row.plusgactionsumm,
    furtherAction: row.hse_further_act,
    rootCause: row.hse_root_causes,
    subCause: row.hse_sub_cause,
    relatedRootCauseId: row.hse_related_rc,
    assetnum: row.assetnum,
    failureCode: row.failurecode,
    reportedBy: row.reportedby,
    enteredByName: row.plusgsafmtgenteredbyname,
    statusDate: row.statusdate,
    startDate: row.actstart,
    actionType: row.plusgactiontype,
    priority: row.plusgactionprior_description ?? row.plusgactionprior,
    category: row.actcategory,
    agreedBy: row.plusgagreedby,
    reviewer: row.reviewer,
    longDescription: row.description_longdescription,
  };
}

/** Flatten a REP_PLUSGINV row into the shape returned by investigation tools. */
function toInvestigation(row: MaximoRow, detail = false) {
  const base = {
    ticketid: row.ticketid,
    reportNumber: row.hse_reportnumber,
    description: row.description,
    status: row.status,
    statusDescription: INV_STATUS_LABEL[String(row.status)] ?? row.status_description,
    location: row.location,
    discipline: row.bdpocdiscipline,
    incidentGroup: row.plusgincidentgroup,
    severity: row.plusginctype,
    investigationLead: row.plusginvestlead,
    facility: row.hse_facility,
    shutdownType: row.hse_psd_type,
    failureCode: row.failurecode,
    reportDate: row.reportdate,
    eventDate: row.affecteddate,
  };
  if (!detail) return base;
  return {
    ...base,
    rcaNumber: row.hse_rca_rcfa_num,
    technicalReportNumber: row.hse_tech_reportnum,
    assetnum: row.assetnum,
    reportedBy: row.reportedby,
    statusDate: row.statusdate,
    investigationStart: row.hse_inv_startdate,
    consequence: row.hse_conseq_event,
    finding: row.hse_finding,
    leftAsFound: row.hse_leftasfound,
    rcaConducted: row.hse_rca_conduct,
    rcaRecommendation: row.hse_rca_recommend,
    failureMechanism: row.plusgfailmechrem,
    failureSubdivision: row.plusgfailsubdivrem,
    problemCode: row.problemcode,
    causeCode: row.fr1code,
    remedyCode: row.fr2code,
    detectionMethod: row.plusgdetectionmethod_description ?? row.plusgdetectionmethod,
    barrierFailed: row.plusgbarrierfail_description ?? row.plusgbarrierfail,
    hardwareFailureMode: row.plusghardfailmode_description ?? row.plusghardfailmode,
    repeatFailureType: row.hse_rca_repeat_fair_type,
    shutdownDuration: row.hse_duration_shutdown,
    productionLoss: row.hse_production_loss,
    productionImpactCostUsd: row.hse_productionimpactcost,
    failedItem: row.plusgitemnum,
    failedItemInfo: row.plusgmicode,
    lessonLearnedBy: row.hse_lesson_creator,
    lessonLearnedDate: row.hse_lesson_date,
    longDescription: row.description_longdescription,
  };
}

/** Build the REP_PLUSGACT where clause shared by search and summarize. */
function actionWhere(f: ActionFilter): (string | false | undefined)[] {
  const open = f.openOnly || f.overdue || f.dueWithinDays !== undefined;
  const statuses = f.status ?? (open ? [...ACT_OPEN_STATUS] : undefined);
  const inv = f.investigationId && recordKey(f.investigationId);
  return [
    `status!="CAN"`,
    statuses && `status in [${statuses.map(q).join(",")}]`,
    f.pic && `hse_act_pic=${q(f.pic.toUpperCase())}`,
    f.teamLead && `hse_act_tl=${q(f.teamLead.toUpperCase())}`,
    f.discipline && `bdpocdiscipline=${q(f.discipline)}`,
    f.incidentGroup && `hse_plusgincidentgroup=${q(f.incidentGroup)}`,
    f.severity && `hse_plusginctype=${q(f.severity)}`,
    f.location && `location=${like(f.location)}`,
    inv && `relatedrecord.relatedreckey=${q(inv)}`,
    f.relatedWonum && `relatedrecord.relatedreckey=${q(f.relatedWonum.toUpperCase())}`,
    f.reportedAfter && `reportdate>=${oslcDate(f.reportedAfter)}`,
    f.reportedBefore && `reportdate<${oslcDate(f.reportedBefore)}`,
    f.overdue && `hse_act_deadline<${oslcNow()}`,
    f.dueWithinDays !== undefined && `hse_act_deadline>=${oslcNow()} and hse_act_deadline<=${oslcNow(f.dueWithinDays)}`,
  ];
}

function investigationWhere(f: SearchInvestigationsInput): (string | false | undefined)[] {
  return [
    `status!="CANCELED"`,
    !f.status && f.openOnly && `status!="CLOSED"`,
    f.status && `status in [${f.status.map(q).join(",")}]`,
    f.location && `location=${like(f.location)}`,
    f.discipline && `bdpocdiscipline=${q(f.discipline)}`,
    f.incidentGroup && `plusgincidentgroup=${q(f.incidentGroup)}`,
    f.severity && `plusginctype=${q(f.severity)}`,
    f.investLead && `plusginvestlead=${q(f.investLead.toUpperCase())}`,
    f.facility && `hse_facility=${q(f.facility)}`,
    f.shutdownType && `hse_psd_type=${q(f.shutdownType)}`,
    f.reportedAfter && `reportdate>=${oslcDate(f.reportedAfter)}`,
    f.reportedBefore && `reportdate<${oslcDate(f.reportedBefore)}`,
  ];
}

export const maximoClient = {
  async fetchMaximo(endpoint: string, params: Record<string, string | number | undefined> = {}) {
    const url = new URL(`${config.baseUrl}${endpoint}`);

    // Always request lean payloads per Maximo REST best practices
    url.searchParams.append("lean", "1");
    url.searchParams.append("ignorecollectionref", "1");
    url.searchParams.append("ignorekeyref", "1");
    url.searchParams.append("ignorers", "1");

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.append(key, String(value));
    }

    console.log(`[upstream] Requesting: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      headers: {
        apikey: config.apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Maximo API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  },

  /** Run an OSLC query against an object structure and validate the result. */
  async query<S extends z.ZodTypeAny>(objectStructure: string, query: OslcQuery, schema: S): Promise<z.infer<S>> {
    const where = (query.where ?? []).filter(Boolean).join(" and ");
    const raw = await this.fetchMaximo(`/api/os/${objectStructure}`, {
      "oslc.where": where || undefined,
      "oslc.select": query.select,
      "oslc.orderBy": query.orderBy,
      "oslc.pageSize": query.limit,
      pageno: query.pageno || undefined,
      "oslc.searchTerms": query.search && JSON.stringify(query.search.terms.replace(/"/g, "")),
      searchAttributes: query.search?.attributes,
    });
    return schema.parse(raw);
  },

  // ─────────────────────────────────────────────────
  // Work Order methods (oslcmxwodetail)
  // ─────────────────────────────────────────────────

  async searchWorkOrders(input: SearchWorkOrdersInput): Promise<WorkOrderCollection> {
    const {
      location, description, status, siteid, bdpocdiscipline,
      worktype, wopriority, schedFinishAfter, schedFinishBefore, limit = 10,
      plusgsafetycrit, plusgcomcrit, woclass = "WORKORDER", pageno, parent, notCompleted,
    } = input;

    // Parent filter: 'null' → top-level WOs only, 'notnull' → child WOs only,
    // any other value → exact match on parent WONUM.
    // OSLC null syntax: field!="*" means IS NULL, field="*" means IS NOT NULL.
    const parentCondition =
      parent === undefined ? undefined
      : parent === "null" ? `parent!="*"`
      : parent === "notnull" ? `parent="*"`
      : `parent=${q(parent)}`;

    return this.query("oslcmxwodetail", {
      where: [
        location && `location=${like(location)}`,
        description && `description=${like(description)}`,
        status && `status=${q(status)}`,
        // notCompleted=true → exclude all completed/closed statuses (backlog / open WOs)
        notCompleted && `status!="CHKCOMP" and status!="COMP" and historyflag=0`,
        siteid && `siteid=${q(siteid)}`,
        bdpocdiscipline && `bdpocdiscipline=${q(bdpocdiscipline)}`,
        worktype && `worktype=${q(worktype)}`,
        wopriority && `wopriority=${Number(wopriority)}`,
        schedFinishAfter && `schedfinish>=${q(schedFinishAfter)}`,
        schedFinishBefore && `schedfinish<${q(schedFinishBefore)}`,
        plusgsafetycrit !== undefined && `plusgsafetycrit=${plusgsafetycrit ? 1 : 0}`,
        plusgcomcrit !== undefined && `plusgcomcrit=${plusgcomcrit ? 1 : 0}`,
        woclass && `woclass=${q(woclass)}`,
        parentCondition,
      ],
      select: WO_SELECT_FIELDS,
      limit,
      pageno,
    }, WorkOrderCollectionSchema);
  },

  async getWorkOrder(wonum: string, includeLabor?: boolean, includeMaterial?: boolean, includeTasks?: boolean, includeMultiAsset?: boolean): Promise<WorkOrderCollection> {
    const select = [
      WO_SELECT_FIELDS_DETAIL,
      includeLabor && "wplabor{laborcode,craft,skilllevel,regularhours,quantity,linecost}",
      includeMaterial && "wpmaterial{itemnum,itemqty,storeloc,description,unitcost,linecost}",
      includeTasks && "woactivity{taskid,description,status,location,estdur}",
      includeMultiAsset && "multiassetlocci{location,assetnum,isprimary,progress,sequence,location.description}",
    ].filter(Boolean).join(",");

    const res = await this.query("oslcmxwodetail", { where: [`wonum=${q(wonum)}`], select }, WorkOrderCollectionSchema);
    if (includeMultiAsset) {
      for (const wo of res.member) {
        const rows: MultiAssetRow[] = (wo.multiassetlocci ?? []).map((m) => {
          const loc = m.location;
          return {
            location: typeof loc === "string" ? loc : m.$alias_this_attr$location,
            description: typeof loc === "object" ? loc.description : undefined,
            assetnum: m.assetnum,
            isprimary: m.isprimary,
            progress: m.progress,
            sequence: m.sequence,
          };
        });
        (wo as Record<string, unknown>).multiassetlocci = await this.withCritical(rows);
      }
    }
    return res;
  },

  async searchHistoryWOByTag(location: string, limit: number = 10, pageno?: number): Promise<WorkOrderCollection> {
    return this.query("oslcmxwodetail", {
      where: [`location=${like(location)}`, `woclass="WORKORDER"`, `status in ["COMP","CLOSE"]`],
      select: "wonum,description,matusetrans{itemnum,description,issuetype,positivequantity}",
      limit,
      pageno,
    }, WorkOrderCollectionSchema);
  },

  // ─────────────────────────────────────────────────
  // Purchase Order methods (mxpodetails) — CAN is always excluded
  // ─────────────────────────────────────────────────

  async queryPurchaseOrders(query: OslcQuery): Promise<PurchaseOrderCollection> {
    const parsed = await this.query("mxpodetails", query, PurchaseOrderCollectionSchema);
    parsed.member = filterLatestApprovedRevisions(parsed.member);
    return parsed;
  },

  async searchPurchaseOrders(input: SearchPurchaseOrdersInput): Promise<PurchaseOrderCollection> {
    const { vendor, formno, description, status, techpic, purchaseagent, potype, fromDate, toDate, vendeliveryAfter, vendeliveryBefore, limit = 10, pageno } = input;

    return this.queryPurchaseOrders({
      where: [
        'status!="CAN"',
        vendor && `vendor=${like(vendor)}`,
        formno && `formno=${like(formno)}`,
        description && `description=${like(description)}`,
        status && `status=${q(status)}`,
        techpic && `techpic=${q(techpic)}`,
        purchaseagent && `purchaseagent=${q(purchaseagent)}`,
        potype && `potype=${q(potype)}`,
        fromDate && `orderdate>=${q(fromDate)}`,
        toDate && `orderdate<=${q(toDate)}`,
        vendeliveryAfter && `vendeliverydate>=${q(vendeliveryAfter)}`,
        vendeliveryBefore && `vendeliverydate<${q(vendeliveryBefore)}`,
      ],
      select: "ponum,description,status,vendor,companies{name},formno,potype,techpic,purchaseagent,orderdate,vendeliverydate,totalbasecost,siteid",
      orderBy: "-orderdate",
      limit,
      pageno,
    });
  },

  async searchPurchaseOrdersByBudget(input: SearchPurchaseOrdersByBudgetInput): Promise<PurchaseOrderCollection> {
    const { budgetcode, fromDate, toDate, limit = 10, pageno } = input;

    return this.queryPurchaseOrders({
      where: [
        'status!="CAN"',
        `poline.budgetcode=${like(budgetcode)}`,
        fromDate && `orderdate>=${q(fromDate)}`,
        toDate && `orderdate<=${q(toDate)}`,
      ],
      select: "ponum,description,status,vendor,companies{name},formno,potype,techpic,orderdate,totalbasecost,siteid",
      orderBy: "-orderdate",
      limit,
      pageno,
    });
  },

  /** Fetch full Purchase Order detail by PONUM, including line items. */
  async getPurchaseOrder(ponum: string): Promise<PurchaseOrderCollection> {
    return this.queryPurchaseOrders({
      where: [`ponum=${q(ponum)}`],
      select: "ponum,revisionnum,description,status,vendor,companies{name},formno,potype,techpic,orderdate,currencycode,totalcost,totalbasecost,siteid,vendeliverydate,poline{polinenum,itemnum,description,orderqty,unitcost,linecost,storeloc,receivedqty,budgetcode,linetype},xbgvposummary{budgetcode,description}",
    });
  },

  // ─────────────────────────────────────────────────
  // Vendor methods (mxvendor)
  // ─────────────────────────────────────────────────

  async searchVendors(input: SearchVendorInput): Promise<VendorCollection> {
    const { name, limit = 10, pageno } = input;
    return this.query("mxvendor", {
      where: ['type="V"', name && `name=${like(name)}`],
      select: "company,name,type,orgid",
      limit,
      pageno,
    }, VendorCollectionSchema);
  },

  // ─────────────────────────────────────────────────
  // Budget Code methods (oslcmxbudget)
  // ─────────────────────────────────────────────────

  /** Search Budget Codes by budgetcode (partial match also matches an exact code). */
  async getBudgetCodes(input: GetBudgetCodeInput): Promise<BudgetCodeCollection> {
    const { budgetcode, limit = 10, pageno } = input;
    return this.query("oslcmxbudget", {
      where: [`budgetcode=${like(budgetcode)}`],
      select: "budgetcode,parentcode,budgetyear,status,deptcode,custodian,approvedamt,utilizedamt,sbmtremain",
      orderBy: "+budgetcode",
      limit,
      pageno,
    }, BudgetCodeCollectionSchema);
  },

  // ─────────────────────────────────────────────────
  // Exchange Rate methods (mxl-excgrates)
  // ─────────────────────────────────────────────────

  /**
   * Look up the active exchange rate between two currencies for a given date.
   *
   * Maximo may store either the direct pair (e.g. EUR→USD) or the inverse
   * (e.g. USD→VND). The direct pair is tried first; otherwise the inverse is
   * used and inverted so that `normalizedRate` always means:
   * 1 unit of `currencycode` = N units of `currencycodeto`.
   *
   * @param asOfDate - Optional YYYY-MM-DD date to query (defaults to today).
   * @returns The normalized lookup result, or null when no active rate is found.
   */
  async getExchangeRate(
    currencycode: string,
    currencycodeto: string = "USD",
    asOfDate?: string,
  ): Promise<ExchangeRateLookupResult | null> {
    const from = currencycode.toUpperCase();
    const to = currencycodeto.toUpperCase();
    const refDate = asOfDate ?? new Date().toISOString().split("T")[0];

    const fetchRate = async (fromCcy: string, toCcy: string) => {
      const result = await this.query("mxl-excgrates", {
        where: [
          `currencycode=${q(fromCcy)}`,
          `currencycodeto=${q(toCcy)}`,
          `activedate<=${q(refDate)}`,
          `expiredate>=${q(refDate)}`,
        ],
        select: "currencycode,currencycodeto,activedate,expiredate,exchangerate",
        orderBy: "-activedate",
        limit: 1,
      }, ExchangeRateCollectionSchema);
      return result.member[0];
    };

    const toResult = (rec: NonNullable<Awaited<ReturnType<typeof fetchRate>>>, isInverse: boolean): ExchangeRateLookupResult => ({
      currencycode: from,
      currencycodeto: to,
      normalizedRate: !isInverse ? rec.exchangerate : rec.exchangerate !== 0 ? 1 / rec.exchangerate : 0,
      isInverse,
      rawRate: rec.exchangerate,
      rawCurrencyCode: rec.currencycode,
      rawCurrencyCodeTo: rec.currencycodeto,
      activedate: rec.activedate,
      expiredate: rec.expiredate,
    });

    const direct = await fetchRate(from, to);
    if (direct) return toResult(direct, false);

    const inverse = await fetchRate(to, from);
    if (inverse) return toResult(inverse, true);

    return null;
  },

  /**
   * Convert a monetary amount from a given currency to USD.
   * @returns The equivalent amount in USD, rounded to 6 decimal places.
   * @throws When no active exchange rate is found for the currency pair.
   */
  async convertToUsd(amount: number, currencycode: string): Promise<{
    amountUsd: number;
    currencycode: string;
    rateUsed: ExchangeRateLookupResult;
  }> {
    const rateInfo = await this.getExchangeRate(currencycode, "USD");
    if (!rateInfo) {
      throw new Error(
        `No active exchange rate found for ${currencycode.toUpperCase()} ↔ USD as of today. ` +
        `Please ensure the rate is configured in Maximo (mxl-excgrates).`,
      );
    }

    return {
      amountUsd: parseFloat((amount * rateInfo.normalizedRate).toFixed(6)),
      currencycode: currencycode.toUpperCase(),
      rateUsed: rateInfo,
    };
  },

  // ─────────────────────────────────────────────────
  // Location hierarchy methods (mxapilocation = LOCHIERARCHY root, mxapilocsystem)
  // ─────────────────────────────────────────────────

  async queryLocHierarchy(query: Omit<OslcQuery, "select">): Promise<LocHierarchyCollection> {
    return this.query("mxapilocation", { ...query, select: LOC_SELECT_FIELDS }, LocHierarchyCollectionSchema);
  },

  async searchLocations(input: SearchLocationsInput) {
    const { location, description, locType, locFunction, sce, pce, sceGroup, groupBy, systemid, includeDecommissioned, limit = 20, pageno } = input;
    if (!location && !description && !locType && !locFunction && sce === undefined && pce === undefined && !sceGroup) {
      throw new Error("Provide at least one of: location, description, locType, locFunction, sce, pce, sceGroup");
    }
    // LOCATIONS-rooted structure: attribute filters work at root level here.
    const where = [
        location && `location=${like(location)}`,
        description && `description=${like(description)}`,
        locType && eqOrBlank("bdpocloctype", locType),
        locFunction && eqOrBlank("bdpoclocfunction", locFunction),
        sce !== undefined && `plusgsafetycrit=${sce ? 1 : 0}`,
        pce !== undefined && `plusgcomcrit=${pce ? 1 : 0}`,
        sceGroup && eqOrBlank("bdpoclocgroup", sceGroup),
        !includeDecommissioned && `status!="DECOMMISSIONED"`,
    ];
    if (groupBy) return this.groupLocations(where, groupBy);
    const res = await this.query("mxapioperloc", {
      where,
      select: `location,${LOC_ATTR_FIELDS},lochierarchy{parent,systemid,children}`,
      orderBy: "+location",
      limit,
      pageno,
    }, OperLocCollectionSchema);
    return {
      responseInfo: pagingInfo(res.responseInfo),
      member: res.member.map((loc) => {
        const h = loc.lochierarchy?.find((r) => r.systemid === systemid);
        return {
          location: loc.location,
          parent: h?.parent,
          systemid: h ? systemid : undefined,
          ...locAttributes(loc),
          hasChildren: h?.children,
        };
      }),
    };
  },

  /** Server-side group-by count (Maximo `gbcols=...,count.*`), largest group first. */
  async groupLocations(where: (string | false | undefined)[], groupBy: (keyof typeof LOC_GROUP_COLUMNS)[]) {
    const cols = [...new Set(groupBy)].map((g) => LOC_GROUP_COLUMNS[g]);
    const raw = await this.fetchMaximo("/api/os/mxapioperloc", {
      "oslc.where": where.filter(Boolean).join(" and ") || undefined,
      gbcols: `${cols.join(",")},count.*`,
      gbsortby: "-count.*",
    });
    if (!Array.isArray(raw)) throw new Error("Unexpected group-by response from Maximo");
    const groups = raw.map((row: Record<string, unknown>) => {
      const g: Record<string, unknown> = {};
      for (const key of new Set(groupBy)) g[key] = row[LOC_GROUP_COLUMNS[key]] ?? "(blank)";
      if (groupBy.includes("sceGroup") && row.bdpoclocgroup_description) g.sceGroupDescription = row.bdpoclocgroup_description;
      g.count = Number(row.count ?? 0);
      return g;
    });
    return {
      groupBy,
      totalCount: groups.reduce((n, g) => n + (g.count as number), 0),
      groupCount: groups.length,
      groups,
    };
  },

  async getLocationChildren(input: GetLocationChildrenInput): Promise<{ tree: string; legend: string; root: LocationNode }> {
    const { location, systemid, depth = 1, includeDecommissioned, limit = 100 } = input;
    const self = await this.queryLocHierarchy({
      where: [`systemid=${q(systemid)}`, `location=${q(location)}`],
      limit: 1,
    });
    const root: LocationNode = self.member[0]
      ? toLocationNode(self.member[0])
      : { location, systemid, hasChildren: true }; // e.g. site root BD1 has no LOCHIERARCHY row of its own

    const expand = async (node: LocationNode, level: number): Promise<void> => {
      if (level > depth || node.hasChildren === false) return;
      const res = await this.queryLocHierarchy({
        where: [`systemid=${q(systemid)}`, `parent=${q(node.location)}`],
        orderBy: "+location",
        limit,
      });
      // Nested `locations.status` filters are unreliable on mxapilocation → filter here.
      const all = res.member.map(toLocationNode);
      node.children = includeDecommissioned ? all : all.filter((c) => c.status !== "DECOMMISSIONED");
      if ((res.responseInfo?.totalCount ?? 0) > all.length) node.childrenTruncated = true;
      await Promise.all(node.children.map((c) => expand(c, level + 1)));
    };
    await expand(root, 1);
    return { tree: renderTree(root), legend: TREE_LEGEND, root };
  },

  async getLocationAncestors(input: GetLocationAncestorsInput): Promise<{ location: string; systemid: string; tree: string; legend: string; path: LocationNode[] }> {
    const { location, systemid } = input;
    const path: LocationNode[] = [];
    let current: string | undefined = location;
    for (let i = 0; current && i < LOC_MAX_ANCESTOR_LEVELS; i++) {
      const res = await this.queryLocHierarchy({
        where: [`systemid=${q(systemid)}`, `location=${q(current)}`],
        limit: 1,
      });
      const row = res.member[0];
      if (!row) {
        if (i === 0) throw new Error(`Location ${location} not found in system ${systemid}`);
        path.push({ location: current, systemid }); // top node (site) without its own row
        break;
      }
      path.push(toLocationNode(row));
      current = row.parent;
    }
    // root → ... → requested location, rendered as a single-branch tree
    path.reverse();
    const tree = path.map((n, i) => (i === 0 ? "" : "    ".repeat(i - 1) + "└── ") + treeLine(n)).join("\n");
    return { location, systemid, tree, legend: TREE_LEGEND, path };
  },

  async listLocationSystems(input: ListLocationSystemsInput) {
    const { location, query, limit = 100 } = input;
    if (location) {
      const rows = await this.queryLocHierarchy({ where: [`location=${q(location)}`], limit: 50 });
      if (rows.member.length === 0) throw new Error(`Location ${location} not found`);
      const systems = await this.query("mxapilocsystem", {
        where: [`systemid in [${rows.member.map((r) => q(r.systemid ?? "")).join(",")}]`],
        select: "systemid,description,primarysystem",
        limit: 50,
      }, LocSystemCollectionSchema);
      const desc = new Map(systems.member.map((s) => [s.systemid, s.description]));
      return {
        location,
        description: rows.member[0].locations?.[0]?.description,
        systems: rows.member.map((r) => ({
          systemid: r.systemid,
          systemDescription: desc.get(r.systemid ?? ""),
          parent: r.parent,
        })),
      };
    }
    const res = await this.query("mxapilocsystem", {
      where: [query && `description=${like(query)}`],
      select: "systemid,description,primarysystem",
      orderBy: "+systemid",
      limit,
    }, LocSystemCollectionSchema);
    return {
      responseInfo: pagingInfo(res.responseInfo),
      member: res.member.map(({ systemid, description, primarysystem }) => ({ systemid, description, primarysystem })),
    };
  },
  // ─────────────────────────────────────────────────
  // Action Tracking (REP_PLUSGACT) & Investigation (REP_PLUSGINV) methods
  // ─────────────────────────────────────────────────

  /** Generic server-side group-by count on an object structure, largest group first. */
  async groupCount<K extends string>(os: string, where: (string | false | undefined)[], columns: Record<K, string>, groupBy: K[], search?: OslcQuery["search"], statusLabels?: Record<string, string>) {
    const keys = [...new Set(groupBy)];
    const raw = await this.fetchMaximo(`/api/os/${os}`, {
      "oslc.where": where.filter(Boolean).join(" and ") || undefined,
      gbcols: `${keys.map((k) => columns[k]).join(",")},count.*`,
      gbsortby: "-count.*",
      "oslc.searchTerms": search && JSON.stringify(search.terms.replace(/"/g, "")),
      searchAttributes: search?.attributes,
    });
    if (!Array.isArray(raw)) throw new Error("Unexpected group-by response from Maximo");
    const groups = raw.map((row: Record<string, unknown>) => {
      const g: Record<string, unknown> = {};
      for (const k of keys) {
        g[k] = row[columns[k]] ?? "(blank)";
        const desc = (k === "status" && statusLabels?.[String(g[k])]) || row[`${columns[k]}_description`];
        if (desc && desc !== g[k]) g[`${k}Description`] = desc;
      }
      g.count = Number(row.count ?? 0);
      return g;
    });
    return { groupBy: keys, totalCount: groups.reduce((n, g) => n + (g.count as number), 0), groupCount: groups.length, groups };
  },

  /**
   * SCE / PCE label per tag (one mxapioperloc request for all tags).
   * Returns only critical tags; failures are swallowed (highlighting is best effort).
   */
  async criticalLabels(locations: unknown[]): Promise<Map<string, string>> {
    const tags = [...new Set(locations.map(str).filter((t): t is string => !!t))];
    const labels = new Map<string, string>();
    if (tags.length === 0) return labels;
    try {
      const res = await this.query("mxapioperloc", {
        where: [`location in [${tags.map(q).join(",")}]`],
        select: `location,${LOC_ATTR_FIELDS}`,
        limit: tags.length,
      }, OperLocCollectionSchema);
      for (const loc of res.member) {
        const label = criticalLabel(loc);
        if (label) labels.set(loc.location, label);
      }
    } catch (e) {
      console.error("[criticalLabels] lookup failed:", e instanceof Error ? e.message : e);
    }
    return labels;
  },

  /** Attach `critical` (SCE/PCE label) to rows that have a location. */
  async withCritical<T extends { location?: unknown }>(rows: T[]): Promise<(T & { critical?: string })[]> {
    const labels = await this.criticalLabels(rows.map((r) => r.location));
    return rows.map((r) => {
      const critical = labels.get(String(r.location));
      return critical ? { ...r, critical } : r;
    });
  },

  async searchActionTracking(input: SearchActionTrackingInput) {
    const { limit = 20, pageno, ...filter } = input;
    const res = await this.query(ACT_OS, {
      where: actionWhere(filter),
      search: searchOf(filter.query, ACT_SEARCH_ATTRS),
      select: ACT_LIST_FIELDS,
      orderBy: filter.overdue || filter.dueWithinDays || filter.openOnly ? "+hse_act_deadline" : "-reportdate",
      limit,
      pageno,
    }, RowCollectionSchema);
    return {
      responseInfo: pagingInfo(res.responseInfo),
      member: await this.withCritical(res.member.map((r) => toAction(r))),
    };
  },

  async summarizeActionTracking(input: SummarizeActionTrackingInput) {
    const { groupBy, ...filter } = input;
    return this.groupCount(ACT_OS, actionWhere(filter), ACT_GROUP_COLUMNS, groupBy, searchOf(filter.query, ACT_SEARCH_ATTRS), ACT_STATUS_LABEL);
  },

  /** Short summaries of related records, grouped by class (one request per class). */
  async describeRelatedRecords(related: RelatedRecord[] = []) {
    const keysOf = (...classes: string[]) =>
      [...new Set(related.filter((r) => classes.includes(r.relatedrecclass ?? "")).map((r) => r.relatedreckey ?? r.relatedrecwonum).filter((k): k is string => !!k))];
    const invKeys = keysOf("INVESTIGATION", "INCIDENT");
    const woKeys = keysOf("WORKORDER");
    const actKeys = keysOf("ACTTRACK");
    const byKey = new Map<string, Record<string, unknown>>();
    await Promise.all([
      invKeys.length && this.query(INV_OS, { where: [`ticketid in [${invKeys.map(q).join(",")}]`], select: INV_LIST_FIELDS, limit: invKeys.length }, RowCollectionSchema)
        .then((r) => r.member.forEach((m) => byKey.set(String(m.ticketid), toInvestigation(m)))),
      woKeys.length && this.query("oslcmxwodetail", { where: [`wonum in [${woKeys.map(q).join(",")}]`], select: "wonum,description,status,worktype,location,actfinish", limit: woKeys.length }, RowCollectionSchema)
        .then((r) => r.member.forEach((m) => byKey.set(String(m.wonum), { wonum: m.wonum, description: m.description, status: m.status, worktype: m.worktype, location: m.location, completedDate: m.actfinish }))),
      actKeys.length && this.query(ACT_OS, { where: [`wonum in [${actKeys.map(q).join(",")}]`], select: ACT_LIST_FIELDS, limit: actKeys.length }, RowCollectionSchema)
        .then((r) => r.member.forEach((m) => byKey.set(String(m.wonum), toAction(m)))),
    ]);
    return related.map((r) => {
      const key = r.relatedreckey ?? r.relatedrecwonum;
      return { class: r.relatedrecclass, relation: r.relatetype, key, record: key ? byKey.get(key) : undefined };
    });
  },

  async getActionTracking(input: GetActionTrackingInput) {
    const wonum = recordKey(input.id);
    const res = await this.query(ACT_OS, {
      where: [`wonum=${q(wonum)}`, `status!="CAN"`],
      select: ACT_DETAIL_FIELDS,
      limit: 1,
    }, RowCollectionSchema);
    const row = res.member[0];
    if (!row) throw new Error(`Action ${input.id} not found (or cancelled)`);
    const [action] = await this.withCritical([toAction(row, true)]);
    return { ...action, relatedRecords: await this.describeRelatedRecords(row.relatedrecord) };
  },

  async searchInvestigations(input: SearchInvestigationsInput) {
    const { groupBy, limit = 20, pageno } = input;
    const where = investigationWhere(input);
    const search = searchOf(input.query, INV_SEARCH_ATTRS);
    if (groupBy) return this.groupCount(INV_OS, where, INV_GROUP_COLUMNS, groupBy, search, INV_STATUS_LABEL);
    const res = await this.query(INV_OS, { where, search, select: INV_LIST_FIELDS, orderBy: "-reportdate", limit, pageno }, RowCollectionSchema);
    return {
      responseInfo: pagingInfo(res.responseInfo),
      member: await this.withCritical(res.member.map((r) => toInvestigation(r))),
    };
  },

  async getInvestigationRow(id: string, select: string) {
    const ticketid = recordKey(id);
    const res = await this.query(INV_OS, {
      where: [`ticketid=${q(ticketid)}`, `status!="CANCELED"`],
      select,
      limit: 1,
    }, RowCollectionSchema);
    const row = res.member[0];
    if (!row) throw new Error(`Investigation ${id} not found (or cancelled)`);
    return row;
  },

  async getInvestigation(input: GetInvestigationInput) {
    const row = await this.getInvestigationRow(input.id, INV_DETAIL_FIELDS);
    const [inv] = await this.withCritical([toInvestigation(row, true)]);
    const related = await this.describeRelatedRecords(row.relatedrecord);
    const actions = related.filter((r) => r.class === "ACTTRACK");
    const open = actions.filter((a) => isOpenAction((a.record as { status?: unknown } | undefined)?.status)).length;
    return {
      ...inv,
      actionSummary: { total: actions.length, open, closed: actions.length - open },
      relatedRecords: related,
    };
  },

  async listActionsByInvestigation(input: ListActionsByInvestigationInput) {
    const { investigationId, includeClosed = true } = input;
    const row = await this.getInvestigationRow(investigationId, INV_LIST_FIELDS);
    const res = await this.query(ACT_OS, {
      where: [
        `status!="CAN"`,
        !includeClosed && `status in [${ACT_OPEN_STATUS.map(q).join(",")}]`,
        `relatedrecord.relatedreckey=${q(String(row.ticketid))}`,
      ],
      select: `${ACT_LIST_FIELDS},plusgactionsumm,hse_root_causes,hse_sub_cause`,
      orderBy: "+hse_act_deadline",
      limit: 200,
    }, RowCollectionSchema);
    const actions = res.member.map((r) => ({
      ...toAction(r),
      actionSummary: r.plusgactionsumm,
      rootCause: r.hse_root_causes,
      subCause: r.hse_sub_cause,
    }));
    const statusCounts: Record<string, number> = {};
    for (const a of actions) statusCounts[String(a.status)] = (statusCounts[String(a.status)] ?? 0) + 1;
    const [investigation] = await this.withCritical([toInvestigation(row)]);
    return {
      investigation,
      summary: {
        total: actions.length,
        open: actions.filter((a) => isOpenAction(a.status)).length,
        overdue: actions.filter((a) => a.overdue).length,
        byStatus: statusCounts,
      },
      actions: await this.withCritical(actions),
    };
  },
};
