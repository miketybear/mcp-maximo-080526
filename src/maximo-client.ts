import { config } from "./config.js";
import type { SearchWorkOrdersInput, WorkOrderCollection } from "./types/index.js";
import { WorkOrderCollectionSchema } from "./types/index.js";
import type { SearchPurchaseOrdersInput, SearchPurchaseOrdersByBudgetInput, PurchaseOrderCollection, PurchaseOrder } from "./types/index.js";
import { PurchaseOrderCollectionSchema } from "./types/index.js";
import type { SearchVendorInput, VendorCollection } from "./types/index.js";
import { VendorCollectionSchema } from "./types/index.js";
import type { GetBudgetCodeInput, BudgetCodeCollection } from "./types/index.js";
import { BudgetCodeCollectionSchema } from "./types/index.js";
import type { ExchangeRateLookupResult } from "./types/index.js";
import { ExchangeRateCollectionSchema } from "./types/index.js";

function filterLatestApprovedRevisions(pos: PurchaseOrder[]): PurchaseOrder[] {
  const groups: Record<string, PurchaseOrder[]> = {};
  for (const po of pos) {
    if (!po.ponum) continue;
    if (!groups[po.ponum]) {
      groups[po.ponum] = [];
    }
    groups[po.ponum].push(po);
  }

  const result: PurchaseOrder[] = [];
  const approvedStatuses = ["APPR", "INPRG", "CLOSE"];

  for (const ponum of Object.keys(groups)) {
    const revisions = groups[ponum];
    revisions.sort((a, b) => (b.revisionnum ?? 0) - (a.revisionnum ?? 0));
    const latestApproved = revisions.find(r => r.status && approvedStatuses.includes(r.status));
    result.push(latestApproved || revisions[0]);
  }

  return result;
}

/** Shared list of selected work order attributes for OSLC queries. */
const WO_SELECT_FIELDS = "wonum,parent,description,status,woclass,location,bdpocdiscipline,worktype,plusgsafetycrit,plusgcomcrit";

/** Extended select list (used by getWorkOrder). */
const WO_SELECT_FIELDS_DETAIL = `${WO_SELECT_FIELDS},reportdate,assetnum,schedstart,schedfinish,actstart,actfinish,estdur,wopriority,siteid,description_longdescription`;

export const maximoClient = {
  async fetchMaximo(endpoint: string, params: Record<string, string | number | undefined> = {}) {
    const url = new URL(`${config.baseUrl}${endpoint}`);

    // Always append lean=1 and ignorecollectionref=1 per best practices
    url.searchParams.append("lean", "1");
    url.searchParams.append("ignorecollectionref", "1");
    url.searchParams.append("ignorekeyref", "1");
    url.searchParams.append("ignorers", "1");

    // Append other params
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });

    console.log(`[upstream] Requesting: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      headers: {
        'apikey': config.apiKey,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Maximo API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  },

  async searchWorkOrders(input: SearchWorkOrdersInput): Promise<WorkOrderCollection> {
    const {
      location, description, status, siteid, bdpocdiscipline,
      worktype, wopriority, schedFinishAfter, schedFinishBefore, limit = 10,
      plusgsafetycrit, plusgcomcrit, woclass = "WORKORDER", pageno, parent, notCompleted,
    } = input;

    // Build the oslc.where string based on provided fields
    const whereConditions: string[] = [];

    if (location) whereConditions.push(`location="%${location}%"`);
    if (description) whereConditions.push(`description="%${description}%"`);
    if (status) whereConditions.push(`status="${status}"`);
    // notCompleted=true → exclude all completed/closed statuses (backlog / open WOs)
    if (notCompleted) whereConditions.push(`status!="CHKCOMP" and status!="COMP" and historyflag=0`);
    if (siteid) whereConditions.push(`siteid="${siteid}"`);
    if (bdpocdiscipline) whereConditions.push(`bdpocdiscipline="${bdpocdiscipline}"`);
    if (worktype) whereConditions.push(`worktype="${worktype}"`);
    if (wopriority) whereConditions.push(`wopriority=${wopriority}`);
    if (schedFinishAfter) whereConditions.push(`schedfinish>="${schedFinishAfter}"`);
    if (schedFinishBefore) whereConditions.push(`schedfinish<"${schedFinishBefore}"`);
    if (plusgsafetycrit !== undefined) whereConditions.push(`plusgsafetycrit=${plusgsafetycrit ? "1" : "0"}`);
    if (plusgcomcrit !== undefined) whereConditions.push(`plusgcomcrit=${plusgcomcrit ? "1" : "0"}`);
    if (woclass) whereConditions.push(`woclass="${woclass}"`);

    // Parent filter: 'null' → top-level WOs only, 'notnull' → child WOs only,
    // any other value → exact match on parent WONUM.
    // OSLC null syntax: field!="*" means IS NULL, field="*" means IS NOT NULL.
    if (parent !== undefined) {
      if (parent === "null") {
        whereConditions.push(`parent!="*"`);
      } else if (parent === "notnull") {
        whereConditions.push(`parent="*"`);
      } else {
        whereConditions.push(`parent="${parent}"`);
      }
    }

    const params: Record<string, string | number> = {
      "oslc.pageSize": limit,
    };

    if (pageno) {
      params["pageno"] = pageno;
    }

    if (whereConditions.length > 0) {
      params["oslc.where"] = whereConditions.join(" and ");
    }

    // Default select attributes as requested
    params["oslc.select"] = WO_SELECT_FIELDS;

    const raw = await this.fetchMaximo('/api/os/oslcmxwodetail', params);
    return WorkOrderCollectionSchema.parse(raw);
  },

  async getWorkOrder(wonum: string, includeLabor?: boolean, includeMaterial?: boolean, includeTasks?: boolean): Promise<WorkOrderCollection> {
    let selectFields = WO_SELECT_FIELDS_DETAIL;
    if (includeLabor) {
      selectFields += ",wplabor{laborcode,craft,skilllevel,regularhours,quantity,linecost}";
    }
    if (includeMaterial) {
      selectFields += ",wpmaterial{itemnum,itemqty,storeloc,description,unitcost,linecost}";
    }
    if (includeTasks) {
      selectFields += ",woactivity{taskid,description,status,location,estdur}";
    }

    // Fetch exact match by wonum
    const params = {
      "oslc.where": `wonum="${wonum}"`,
      "oslc.select": selectFields,
    };

    const raw = await this.fetchMaximo('/api/os/oslcmxwodetail', params);
    return WorkOrderCollectionSchema.parse(raw);
  },

  async searchHistoryWOByTag(location: string, limit: number = 10, pageno?: number): Promise<WorkOrderCollection> {
    const params: Record<string, string | number> = {
      "oslc.where": `location="%${location}%" and woclass="WORKORDER" and status in ["COMP","CLOSE"]`,
      "oslc.select": "wonum,description,matusetrans{itemnum,description,issuetype,positivequantity}",
      "oslc.pageSize": limit,
    };

    if (pageno) {
      params["pageno"] = pageno;
    }

    const raw = await this.fetchMaximo('/api/os/oslcmxwodetail', params);
    return WorkOrderCollectionSchema.parse(raw);
  },

  // ─────────────────────────────────────────────────
  // Purchase Order methods (mxpodetails)
  // ─────────────────────────────────────────────────

  /**
   * Search Purchase Orders by vendor, formno, description, status, techpic, potype.
   * CAN status is always excluded — never add it to the where clause.
   */
  async searchPurchaseOrders(input: SearchPurchaseOrdersInput): Promise<PurchaseOrderCollection> {
    const { vendor, formno, description, status, techpic, purchaseagent, potype, fromDate, toDate, vendeliveryAfter, vendeliveryBefore, limit = 10, pageno } = input;

    const whereConditions: string[] = [
      // Always exclude cancelled POs
      'status!="CAN"',
    ];

    if (vendor) whereConditions.push(`vendor="%${vendor}%"`);
    if (formno) whereConditions.push(`formno="%${formno}%"`);
    if (description) whereConditions.push(`description="%${description}%"`);
    if (status) whereConditions.push(`status="${status}"`);
    if (techpic) whereConditions.push(`techpic="${techpic}"`);
    if (purchaseagent) whereConditions.push(`purchaseagent="${purchaseagent}"`);
    if (potype) whereConditions.push(`potype="${potype}"`);
    if (fromDate) whereConditions.push(`orderdate>="${fromDate}"`);
    if (toDate) whereConditions.push(`orderdate<="${toDate}"`);
    if (vendeliveryAfter) whereConditions.push(`vendeliverydate>="${vendeliveryAfter}"`);
    if (vendeliveryBefore) whereConditions.push(`vendeliverydate<"${vendeliveryBefore}"`);

    const params: Record<string, string | number> = {
      "oslc.where": whereConditions.join(" and "),
      "oslc.select": "ponum,description,status,vendor,companies{name},formno,potype,techpic,purchaseagent,orderdate,vendeliverydate,totalbasecost,siteid",
      "oslc.pageSize": limit,
      "oslc.orderBy": "-orderdate",
    };

    if (pageno) {
      params["pageno"] = pageno;
    }

    const raw = await this.fetchMaximo('/api/os/mxpodetails', params);
    const parsed = PurchaseOrderCollectionSchema.parse(raw);
    parsed.member = filterLatestApprovedRevisions(parsed.member);
    return parsed;
  },

  /**
   * Search Purchase Orders by budget code.
   * Excludes cancelled POs automatically.
   */
  async searchPurchaseOrdersByBudget(input: SearchPurchaseOrdersByBudgetInput): Promise<PurchaseOrderCollection> {
    const { budgetcode, fromDate, toDate, limit = 10, pageno } = input;

    const whereConditions: string[] = [
      'status!="CAN"',
      `poline.budgetcode="%${budgetcode}%"`,
    ];

    if (fromDate) whereConditions.push(`orderdate>="${fromDate}"`);
    if (toDate) whereConditions.push(`orderdate<="${toDate}"`);

    const params: Record<string, string | number> = {
      "oslc.where": whereConditions.join(" and "),
      "oslc.select": "ponum,description,status,vendor,companies{name},formno,potype,techpic,orderdate,totalbasecost,siteid",
      "oslc.pageSize": limit,
      "oslc.orderBy": "-orderdate",
    };

    if (pageno) {
      params["pageno"] = pageno;
    }

    const raw = await this.fetchMaximo('/api/os/mxpodetails', params);
    const parsed = PurchaseOrderCollectionSchema.parse(raw);
    parsed.member = filterLatestApprovedRevisions(parsed.member);
    return parsed;
  },

  /**
   * Fetch full Purchase Order detail by PONUM, including line items.
   */
  async getPurchaseOrder(ponum: string): Promise<PurchaseOrderCollection> {
    const params = {
      "oslc.where": `ponum="${ponum}"`,
      "oslc.select": "ponum,revisionnum,description,status,vendor,companies{name},formno,potype,techpic,orderdate,currencycode,totalcost,totalbasecost,siteid,vendeliverydate,poline{polinenum,itemnum,description,orderqty,unitcost,linecost,storeloc,receivedqty,budgetcode,linetype},xbgvposummary{budgetcode,description}",
    };

    const raw = await this.fetchMaximo('/api/os/mxpodetails', params);
    const parsed = PurchaseOrderCollectionSchema.parse(raw);
    parsed.member = filterLatestApprovedRevisions(parsed.member);
    return parsed;
  },

  // ─────────────────────────────────────────────────
  // Vendor methods (mxvendor)
  // ─────────────────────────────────────────────────

  async searchVendors(input: SearchVendorInput): Promise<VendorCollection> {
    const { name, limit = 10, pageno } = input;

    const whereConditions: string[] = [
      'type="V"',
    ];

    if (name) {
      whereConditions.push(`name="%${name}%"`);
    }

    const params: Record<string, string | number> = {
      "oslc.where": whereConditions.join(" and "),
      "oslc.select": "company,name,type,orgid",
      "oslc.pageSize": limit,
    };

    if (pageno) {
      params["pageno"] = pageno;
    }

    const raw = await this.fetchMaximo('/api/os/mxvendor', params);
    return VendorCollectionSchema.parse(raw);
  },

  // ─────────────────────────────────────────────────
  // Budget Code methods (oslcmxbudget)
  // ─────────────────────────────────────────────────

  /**
   * Search Budget Codes by budgetcode field (exact or partial match).
   * Returns: budgetcode, parentcode, budgetyear, status, deptcode,
   *          custodian, approvedamt, utilizedamt, sbmtremain.
   */
  async getBudgetCodes(input: GetBudgetCodeInput): Promise<BudgetCodeCollection> {
    const { budgetcode, limit = 10, pageno } = input;

    // Use wildcard wrapping for partial match; an exact code will still match
    // because Maximo's LIKE comparison treats "%exact%" as a full-string match.
    const params: Record<string, string | number> = {
      "oslc.where": `budgetcode="%${budgetcode}%"`,
      "oslc.select": "budgetcode,parentcode,budgetyear,status,deptcode,custodian,approvedamt,utilizedamt,sbmtremain",
      "oslc.pageSize": limit,
      "oslc.orderBy": "+budgetcode",
    };

    if (pageno) {
      params["pageno"] = pageno;
    }

    const raw = await this.fetchMaximo('/api/os/oslcmxbudget', params);
    return BudgetCodeCollectionSchema.parse(raw);
  },

  // ─────────────────────────────────────────────────
  // Exchange Rate methods (mxl-excgrates)
  // ─────────────────────────────────────────────────

  /**
   * Look up the currently active exchange rate between two currencies.
   *
   * Maximo may store either the direct pair (e.g. EUR→USD) or the inverse
   * (e.g. USD→VND). This method tries the direct pair first; if no record is
   * found it retries with the pairs swapped and inverts the rate so that
   * `normalizedRate` always means: 1 unit of `currencycode` = N units of `currencycodeto`.
   *
   * Filters to records that are active today:
   *   activedate <= today AND expiredate >= today
   * Orders by -activedate to pick the most recently effective record.
   *
   * @returns The normalized lookup result, or null when no active rate is found.
   */
  async getExchangeRate(
    currencycode: string,
    currencycodeto: string = "USD"
  ): Promise<ExchangeRateLookupResult | null> {
    const from = currencycode.toUpperCase();
    const to = currencycodeto.toUpperCase();

    // Today as YYYY-MM-DD (local date used for Maximo date comparisons)
    const today = new Date().toISOString().split("T")[0];
    const selectFields = "currencycode,currencycodeto,activedate,expiredate,exchangerate";

    const fetchRate = async (fromCcy: string, toCcy: string) => {
      const params: Record<string, string | number> = {
        "oslc.where":
          `currencycode="${fromCcy}" and currencycodeto="${toCcy}"` +
          ` and activedate<="${today}" and expiredate>="${today}"`,
        "oslc.select": selectFields,
        "oslc.pageSize": 1,
        "oslc.orderBy": "-activedate",
      };
      const raw = await this.fetchMaximo('/api/os/mxl-excgrates', params);
      return ExchangeRateCollectionSchema.parse(raw);
    };

    // ── 1. Try direct pair: from → to ──────────────────────────
    const directResult = await fetchRate(from, to);
    if (directResult.member.length > 0) {
      const rec = directResult.member[0];
      return {
        currencycode: from,
        currencycodeto: to,
        normalizedRate: rec.exchangerate,
        isInverse: false,
        rawRate: rec.exchangerate,
        rawCurrencyCode: rec.currencycode,
        rawCurrencyCodeTo: rec.currencycodeto,
        activedate: rec.activedate,
        expiredate: rec.expiredate,
      };
    }

    // ── 2. Try inverse pair: to → from ─────────────────────────
    const inverseResult = await fetchRate(to, from);
    if (inverseResult.member.length > 0) {
      const rec = inverseResult.member[0];
      const normalizedRate = rec.exchangerate !== 0 ? 1 / rec.exchangerate : 0;
      return {
        currencycode: from,
        currencycodeto: to,
        normalizedRate,
        isInverse: true,
        rawRate: rec.exchangerate,
        rawCurrencyCode: rec.currencycode,
        rawCurrencyCodeTo: rec.currencycodeto,
        activedate: rec.activedate,
        expiredate: rec.expiredate,
      };
    }

    return null;
  },

  /**
   * Convert a monetary amount from a given currency to USD.
   *
   * Internally calls getExchangeRate to find the active rate and applies
   * the correct multiplication or division depending on how the pair is stored.
   *
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
        `Please ensure the rate is configured in Maximo (mxl-excgrates).`
      );
    }

    // normalizedRate = 1 unit of currencycode = N USD
    const amountUsd = parseFloat((amount * rateInfo.normalizedRate).toFixed(6));

    return {
      amountUsd,
      currencycode: currencycode.toUpperCase(),
      rateUsed: rateInfo,
    };
  },
};
