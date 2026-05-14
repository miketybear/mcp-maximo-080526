import { config } from "./config.js";
import type { SearchWorkOrdersInput, WorkOrderCollection } from "./types/index.js";
import { WorkOrderCollectionSchema } from "./types/index.js";

/** Shared list of selected work order attributes for OSLC queries. */
const WO_SELECT_FIELDS = "wonum,description,status,woclass,location,bdpocdiscipline,worktype,plusgsafetycrit,plusgcomcrit";

/** Extended select list (used by getWorkOrder). */
const WO_SELECT_FIELDS_DETAIL = `${WO_SELECT_FIELDS},reportdate,assetnum,schedstart,schedfinish,actstart,actfinish,estdur,wopriority,siteid,description_longdescription`;

export const maximoClient = {
  async fetchMaximo(endpoint: string, params: Record<string, string | number | undefined> = {}) {
    const url = new URL(`${config.baseUrl}${endpoint}`);

    // Always append lean=1 and ignorecollectionref=1 per best practices
    url.searchParams.append("lean", "1");
    url.searchParams.append("ignorecollectionref", "1");

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
      location, status, siteid, bdpocdiscipline,
      worktype, wopriority, schedFinishAfter, schedFinishBefore, limit = 10,
      plusgsafetycrit, plusgcomcrit, woclass = "WORKORDER",
    } = input;

    // Build the oslc.where string based on provided fields
    const whereConditions: string[] = [];

    if (location) whereConditions.push(`location="%${location}%"`);
    if (status) whereConditions.push(`status="${status}"`);
    if (siteid) whereConditions.push(`siteid="${siteid}"`);
    if (bdpocdiscipline) whereConditions.push(`bdpocdiscipline="${bdpocdiscipline}"`);
    if (worktype) whereConditions.push(`worktype="${worktype}"`);
    if (wopriority) whereConditions.push(`wopriority=${wopriority}`);
    if (schedFinishAfter) whereConditions.push(`schedfinish>="${schedFinishAfter}"`);
    if (schedFinishBefore) whereConditions.push(`schedfinish<"${schedFinishBefore}"`);
    if (plusgsafetycrit !== undefined) whereConditions.push(`plusgsafetycrit=${plusgsafetycrit ? "1" : "0"}`);
    if (plusgcomcrit !== undefined) whereConditions.push(`plusgcomcrit=${plusgcomcrit ? "1" : "0"}`);
    if (woclass) whereConditions.push(`woclass="${woclass}"`);

    const params: Record<string, string | number> = {
      "oslc.pageSize": limit
    };

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
  }
};
