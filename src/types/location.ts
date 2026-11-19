import { z } from "zod";

// ─────────────────────────────────────────────────
// Notes on the BIENDONG mxapilocation object structure
// ─────────────────────────────────────────────────
// The root object is LOCHIERARCHY (one row per location *per system*), with
// the LOCATIONS record nested in `locations[0]`. Root-level filters are
// location / parent / systemid / siteid / children; tag attributes must be
// filtered through the child, e.g. `locations.description="%pump%"`.
// A tag appears in PRIMARY and optionally in functional systems, so every
// query pins `systemid` (default PRIMARY) to avoid duplicate rows.

const systemidField = z.string().default("PRIMARY").describe(
  "Location system to navigate. Default PRIMARY (the main physical hierarchy BD1 → PQP / HT1 / MT1 / PL-BD → ...). " +
  "Use a functional system ID from list_location_systems (e.g. HT-44-COOLINGMEDIUM, HT-80-FIRE-WATER) to browse that system's tree instead.",
);

const includeDecommissionedField = z.boolean().default(false).describe(
  "Include tags with status DECOMMISSIONED. Default false — only set true when the user asks about removed/decommissioned equipment.",
);

const pagenoField = z.number().int().min(1).optional().describe(
  "Page number to retrieve (default 1). Use responseInfo.totalPages from a previous response to know how many pages exist.",
);

// ─────────────────────────────────────────────────
// Input schemas
// ─────────────────────────────────────────────────

export const SearchLocationsInputSchema = {
  location: z.string().optional().describe("Tag number / location code, partial match, e.g. 4415C or HT-P-4415"),
  description: z.string().optional().describe("Words in the tag description, partial match, e.g. 'Cooling Medium Pump'. Use one short phrase; it is matched as a single CONTAINS pattern."),
  locType: z.string().optional().describe("Equipment type (bdpocloctype), exact, e.g. Pump, Motor, Valves, Transmitter, Gauge, Relief Valve. Use \"(blank)\" for tags with no type (as shown by groupBy)."),
  locFunction: z.string().optional().describe("Equipment function (bdpoclocfunction), exact, e.g. Pressure, Temperature, Pump"),
  sce: z.boolean().optional().describe("true → only Safety Critical Elements (SCE, plusgsafetycrit); false → only non-SCE"),
  pce: z.boolean().optional().describe("true → only Production Critical Elements (PCE, plusgcomcrit); false → only non-PCE"),
  sceGroup: z.string().optional().describe("SCE group code (bdpoclocgroup), exact, e.g. BD-SD001 (Emergency Shutdown System), BD-PC007 (Relief Systems)"),
  systemid: z.string().default("PRIMARY").describe("System whose parent tag is reported for each result. Default PRIMARY."),
  groupBy: z.array(z.enum(["locType", "locFunction", "sceGroup", "status", "sce", "pce"])).min(1).max(3).optional().describe(
    "Return counts per group instead of a tag list (computed by Maximo in one request). " +
    "Use it when a search would match many tags (responseInfo.totalCount > ~100) or the user asks 'how many'/'breakdown', " +
    "e.g. groupBy ['locType'] for SCE group BD-SD001 → Transmitter 550, Gauge 6, ... Then list one group in detail with the matching filter.",
  ),
  includeDecommissioned: includeDecommissionedField,
  limit: z.number().int().min(1).max(100).default(20).describe("Maximum number of records to return"),
  pageno: pagenoField,
} as const;
export type SearchLocationsInput = z.infer<z.ZodObject<typeof SearchLocationsInputSchema>>;

export const GetLocationChildrenInputSchema = {
  location: z.string().describe("Exact parent tag / location code, e.g. HT-P-4415C, PQP or BD1 (site root)"),
  systemid: systemidField,
  depth: z.number().int().min(1).max(3).default(1).describe(
    "How many levels below the location to return (1–3). Default 1 (direct children). " +
    "Use 2–3 only for small sub-trees such as one pump; for platforms (PQP, HT1, MT1, PL-BD) stay at 1 and drill down.",
  ),
  includeDecommissioned: includeDecommissionedField,
  limit: z.number().int().min(1).max(200).default(100).describe("Maximum children returned per parent"),
} as const;
export type GetLocationChildrenInput = z.infer<z.ZodObject<typeof GetLocationChildrenInputSchema>>;

export const GetLocationAncestorsInputSchema = {
  location: z.string().describe("Exact tag / location code, e.g. HT-PM-4415C"),
  systemid: systemidField,
} as const;
export type GetLocationAncestorsInput = z.infer<z.ZodObject<typeof GetLocationAncestorsInputSchema>>;

export const ListLocationSystemsInputSchema = {
  location: z.string().optional().describe("Exact tag. If given, return only the systems this tag belongs to (with its parent in each system)."),
  query: z.string().optional().describe("Partial match on system description, e.g. 'fire water', 'fuel gas'. Ignored when location is given."),
  limit: z.number().int().min(1).max(100).default(100).describe("Maximum number of systems to return"),
} as const;
export type ListLocationSystemsInput = z.infer<z.ZodObject<typeof ListLocationSystemsInputSchema>>;

// ─────────────────────────────────────────────────
// Response schemas
// ─────────────────────────────────────────────────

const PagingLinkSchema = z.object({ href: z.string() }).loose();
const ResponseInfoSchema = z.object({
  totalCount: z.number().optional(),
  totalPages: z.number().optional(),
  pagenum: z.number().optional(),
  nextPage: PagingLinkSchema.optional(),
}).loose().optional();

/** LOCATIONS attributes selected by the location tools. */
export const LocationAttrsSchema = z.object({
  description: z.string().nullish(),
  status: z.string().nullish(),
  bdpocloctype: z.string().nullish(),
  bdpoclocfunction: z.string().nullish(),
  bdpoclocgroup: z.string().nullish(),
  bdpoclocgroup_description: z.string().nullish(),
  plusgpandidnumber: z.string().nullish(),
  plusgsafetycrit: z.boolean().nullish(),
  plusgcomcrit: z.boolean().nullish(),
}).loose();
export type LocationAttrs = z.infer<typeof LocationAttrsSchema>;

/** Raw LOCHIERARCHY row as returned by mxapilocation. */
export const LocHierarchyRowSchema = z.object({
  location: z.string(),
  parent: z.string().optional(),
  systemid: z.string().optional(),
  siteid: z.string().optional(),
  children: z.boolean().optional(),
  locations: z.array(LocationAttrsSchema).optional(),
}).loose();
export type LocHierarchyRow = z.infer<typeof LocHierarchyRowSchema>;

export const LocHierarchyCollectionSchema = z.object({
  member: z.array(LocHierarchyRowSchema),
  responseInfo: ResponseInfoSchema,
}).loose();
export type LocHierarchyCollection = z.infer<typeof LocHierarchyCollectionSchema>;

/**
 * mxapioperloc: LOCATIONS root (use for attribute filters — nested `locations.*`
 * filters on mxapilocation are unreliable), hierarchy rows nested in `lochierarchy`.
 */
export const OperLocCollectionSchema = z.object({
  member: z.array(LocationAttrsSchema.extend({
    location: z.string(),
    lochierarchy: z.array(z.object({
      parent: z.string().optional(),
      systemid: z.string().optional(),
      children: z.boolean().optional(),
    }).loose()).optional(),
  }).loose()),
  responseInfo: ResponseInfoSchema,
}).loose();
export type OperLocCollection = z.infer<typeof OperLocCollectionSchema>;

export const LocSystemCollectionSchema = z.object({
  member: z.array(z.object({
    systemid: z.string(),
    description: z.string().optional(),
    primarysystem: z.boolean().optional(),
  }).loose()),
  responseInfo: ResponseInfoSchema,
}).loose();
export type LocSystemCollection = z.infer<typeof LocSystemCollectionSchema>;

/** Flattened location node returned by the location tools. */
export interface LocationNode {
  location: string;
  description?: string;
  parent?: string;
  systemid?: string;
  status?: string;
  /** bdpocloctype */
  locType?: string;
  /** bdpoclocfunction */
  locFunction?: string;
  /** plusgpandidnumber */
  pidNumber?: string;
  /** Safety Critical Element (plusgsafetycrit) */
  sce?: boolean;
  /** SCE group code / description (bdpoclocgroup) */
  sceGroup?: string;
  sceGroupDescription?: string;
  /** Production Critical Element (plusgcomcrit) */
  pce?: boolean;
  /** Highlight label, set only for SCE/PCE tags, e.g. "🔴 SCE (BD-SD001 Emergency Shutdown System) · 🟡 PCE" */
  critical?: string;
  hasChildren?: boolean;
  children?: LocationNode[];
  childrenTruncated?: boolean;
}
