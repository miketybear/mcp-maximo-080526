// Usage: node baseline.mjs <baseUrl> <outDir> [location] [ponum]
// Captures tools/list + sample tool calls as normalized JSON for v1/v2 comparison.
import fs from "node:fs";
const [, , base, out, locArg, poArg] = process.argv;
fs.mkdirSync(out, { recursive: true });
const headers = {
  Authorization: "Bearer t",
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};
let id = 0;
async function rpc(method, params) {
  const r = await fetch(`${base}/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  const text = await r.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  return JSON.parse(line ? line.slice(6) : text);
}
const call = async (name, args) => {
  const res = await rpc("tools/call", { name, arguments: args });
  const c = res.result;
  return { isError: !!c?.isError, data: c ? JSON.parse(c.content[0].text) : res };
};
const save = (f, v) => fs.writeFileSync(`${out}/${f}`, JSON.stringify(v, null, 2));

save("tools-list.json", (await rpc("tools/list", {})).result);

let location = locArg, ponum = poArg;
if (!location) location = (await call("search_work_orders", { limit: 1 })).data.member[0].location;
if (!ponum) ponum = (await call("search_purchase_orders", { limit: 1 })).data.member[0].ponum;
save("inputs.json", { location, ponum });

const fx = await call("get_exchange_rate", { currencycode: "VND", asOfDate: "2026-11-18" });
save("get_exchange_rate.json", fx);
save("search_work_orders.json", await call("search_work_orders", { location, limit: 2 }));
save("get_purchase_order.json", await call("get_purchase_order", { ponum }));
save("error_case.json", await call("get_exchange_rate", { currencycode: "XXX", asOfDate: "2026-11-18" }));
console.log("saved", out, { location, ponum });
