import type { z } from "zod";
import { config } from "./config.js";
import type {
  SearchWorkOrdersInput, WorkOrderCollection,
  SearchPurchaseOrdersInput, SearchPurchaseOrdersByBudgetInput, PurchaseOrderCollection, PurchaseOrder,
  SearchVendorInput, VendorCollection,
  GetBudgetCodeInput, BudgetCodeCollection,
  ExchangeRateLookupResult,
} from "./types/index.js";
import {
  WorkOrderCollectionSchema,
  PurchaseOrderCollectionSchema,
  VendorCollectionSchema,
  BudgetCodeCollectionSchema,
  ExchangeRateCollectionSchema,
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
}

/** Shared list of selected work order attributes for OSLC queries. */
const WO_SELECT_FIELDS = "wonum,parent,description,status,woclass,location,bdpocdiscipline,worktype,plusgsafetycrit,plusgcomcrit";
/** Extended select list (used by getWorkOrder). */
const WO_SELECT_FIELDS_DETAIL = `${WO_SELECT_FIELDS},reportdate,assetnum,schedstart,schedfinish,actstart,actfinish,estdur,wopriority,siteid,description_longdescription`;

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

  async getWorkOrder(wonum: string, includeLabor?: boolean, includeMaterial?: boolean, includeTasks?: boolean): Promise<WorkOrderCollection> {
    const select = [
      WO_SELECT_FIELDS_DETAIL,
      includeLabor && "wplabor{laborcode,craft,skilllevel,regularhours,quantity,linecost}",
      includeMaterial && "wpmaterial{itemnum,itemqty,storeloc,description,unitcost,linecost}",
      includeTasks && "woactivity{taskid,description,status,location,estdur}",
    ].filter(Boolean).join(",");

    return this.query("oslcmxwodetail", { where: [`wonum=${q(wonum)}`], select }, WorkOrderCollectionSchema);
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
};
