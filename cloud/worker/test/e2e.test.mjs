// End-to-end test against a running HanX cloud server.
//   HANX_CLOUD_URL=http://127.0.0.1:8787 node --test test/
// Requires the Worker (wrangler dev --env local) and the engine container to be running.
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.HANX_CLOUD_URL;
const skip = BASE ? false : "set HANX_CLOUD_URL to run";
let seq = 0;

async function rpc(method, params) {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++seq, method, params }),
  });
  assert.equal(res.status, 200);
  return res.json();
}

async function tool(name, args) {
  const reply = await rpc("tools/call", { name, arguments: args });
  assert.ok(reply.result, JSON.stringify(reply));
  return { isError: reply.result.isError, data: JSON.parse(reply.result.content[0].text) };
}

test("protocol handshake and tool list", { skip }, async () => {
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.equal(init.result.serverInfo.name, "hanx");
  const note = await fetch(`${BASE}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  assert.equal(note.status, 202);
  const names = (await rpc("tools/list")).result.tools.map((t) => t.name);
  for (const name of ["hanx_create", "hanx_read", "hanx_edit", "hanx_convert", "hanx_sheet_eval", "hanx_guide", "hanx_upload_link"]) assert.ok(names.includes(name), name);
  assert.equal((await rpc("not/a/method")).error.code, -32601);
});

test("create, read, edit, convert and download a HWP document", { skip }, async () => {
  const created = await tool("hanx_create", { spec: { kind: "document", text: "2025년 보고서 원문" }, filename: "보고서.hwp" });
  assert.equal(created.isError, false, JSON.stringify(created.data));
  assert.match(created.data.file.id, /^hx_[a-z0-9]{24}$/);
  assert.ok(!JSON.stringify(created.data).includes("/tmp/"), "container paths must not leak");

  const read = await tool("hanx_read", { file: created.data.file.id });
  assert.equal(read.data.data.text, "2025년 보고서 원문");
  assert.equal(read.data.data.model, undefined, "noModel defaults to true");

  const edited = await tool("hanx_edit", { file: created.data.file.id, operations: [{ op: "replace_text", find: "2025년", replace: "2026년" }] });
  assert.equal(edited.data.file.name, "보고서-edited.hwp");

  const converted = await tool("hanx_convert", { file: edited.data.file.url, format: "docx" });
  assert.equal(converted.data.file.name, "보고서-edited.docx");
  assert.equal((await tool("hanx_read", { file: converted.data.file.id })).data.data.text, "2026년 보고서 원문");

  const download = await fetch(converted.data.file.url);
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-disposition"), /filename\*=UTF-8''/);
  const bytes = new Uint8Array(await download.arrayBuffer());
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), "PK");
});

test("upload a spreadsheet and calculate", { skip }, async () => {
  const csv = "상품,수량,단가\n사과,2,1000\n배,3,2000\n";
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "매출.csv");
  const uploaded = await (await fetch(`${BASE}/upload`, { method: "POST", body: form })).json();
  assert.equal(uploaded.ok, true, JSON.stringify(uploaded));

  const xlsx = await tool("hanx_convert", { file: uploaded.file.id, format: "xlsx" });
  assert.equal(xlsx.isError, false, JSON.stringify(xlsx.data));
  const value = await tool("hanx_sheet_eval", { file: xlsx.data.file.id, formula: "=SUMPRODUCT(B2:B3,C2:C3)" });
  assert.equal(value.data.data.value ?? value.data.data.result?.value, 8000, JSON.stringify(value.data));

  const raw = await (await fetch(`${BASE}/upload?name=${encodeURIComponent("원본.csv")}`, { method: "POST", body: csv })).json();
  assert.equal(raw.file.name, "원본.csv");
});

test("rejects bad input without crashing", { skip }, async () => {
  const missing = await tool("hanx_read", { file: "hx_000000000000000000000000" });
  assert.equal(missing.isError, true);
  assert.match(missing.data.error, /not found|expired/);
  const local = await tool("hanx_read", { file: "/etc/passwd" });
  assert.equal(local.isError, true);
  const sneaky = await tool("hanx_create", { spec: { kind: "document", blocks: [{ type: "image", path: "/etc/passwd" }] }, filename: "x.docx" });
  assert.equal(sneaky.isError, true);
  assert.match(sneaky.data.error, /Local file paths/);
  assert.equal((await rpc("tools/call", { name: "hanx_read", arguments: { input: "/x" } })).error.code, -32602);
  assert.equal((await fetch(`${BASE}/f/hx_000000000000000000000000/x`)).status, 404);
});
