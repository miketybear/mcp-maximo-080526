import { config } from "./config.js";
import type { SearchWorkOrdersInput, WorkOrderCollection } from "./types/index.js";
import { WorkOrderCollectionSchema } from "./types/index.js";

/** Shared list of selected work order attributes for OSLC queries. */
const WO_SELECT_FIELDS = "wonum,description,status,reportdate,assetnum,location,bdpocdiscipline,worktype,schedstart,schedfinish,actstart,actfinish,estdur,wopriority,plusgsafetycrit,plusgcomcrit";

/** Extended select list that includes siteid (used by getWorkOrder). */
const WO_SELECT_FIELDS_DETAIL = `${WO_SELECT_FIELDS},siteid`;

export const maximoClient = {
  async fetchMaximo(endpoint: string, params: Record<string, string | number | undefined> = {}) {
    const url = new URL(`${config.baseUrl}${endpoint}`);

    // Always append lean=1 for NextGen API per best practices
    url.searchParams.append("lean", "1");

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
      wonum, description, status, siteid, bdpocdiscipline,
      worktype, schedFinishAfter, schedFinishBefore, limit = 10,
    } = input;

    // Build the oslc.where string based on provided fields
    const whereConditions: string[] = [];

    if (wonum) whereConditions.push(`wonum="${wonum}"`);
    if (description) whereConditions.push(`description="%${description}%"`);
    if (status) whereConditions.push(`status="${status}"`);
    if (siteid) whereConditions.push(`siteid="${siteid}"`);
    if (bdpocdiscipline) whereConditions.push(`bdpocdiscipline="${bdpocdiscipline}"`);
    if (worktype) whereConditions.push(`worktype="${worktype}"`);
    if (schedFinishAfter) whereConditions.push(`schedfinish>="${schedFinishAfter}"`);
    if (schedFinishBefore) whereConditions.push(`schedfinish<"${schedFinishBefore}"`);

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
