import type { Env } from "./env";

export class ToolError extends Error {
  constructor(message: string, readonly rpcCode?: number) {
    super(message);
  }
}

export interface FileInfo {
  id: string;
  name: string;
  size: number;
  url: string;
  expiresAt: string;
}

const ID = /^hx_[a-z0-9]{24}$/;
const TYPES: Record<string, string> = {
  hwp: "application/x-hwp",
  hwpx: "application/hwp+zip",
  hml: "application/xml",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
  tsv: "text/tab-separated-values; charset=utf-8",
  xml: "application/xml",
  json: "application/json",
  html: "text/plain; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  pdf: "application/pdf",
};

export const maxBytes = (env: Env) => Number(env.MAX_FILE_MB || "20") * 1024 * 1024;
const ttlMs = (env: Env) => Number(env.FILE_TTL_HOURS || "24") * 3600 * 1000;

export function newId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return "hx_" + Array.from(bytes, (b) => alphabet[b % 36]).join("");
}

export function cleanName(name: string, fallback = "file"): string {
  const base = name.normalize("NFC").replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, "_").replace(/^[ .]+|[ .]+$/g, "").slice(0, 180);
  return cleaned || fallback;
}

export function contentType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return TYPES[ext] ?? "application/octet-stream";
}

export function fileUrl(origin: string, id: string, name: string) {
  return `${origin}/f/${id}/${encodeURIComponent(name)}`;
}

export async function storeFile(env: Env, origin: string, rawName: string, bytes: Uint8Array): Promise<FileInfo> {
  if (bytes.byteLength > maxBytes(env)) throw new ToolError(`File is larger than ${env.MAX_FILE_MB || "20"} MB.`);
  const id = newId();
  const name = cleanName(rawName);
  const created = Date.now();
  await env.FILES.put(`f/${id}`, bytes, {
    httpMetadata: { contentType: contentType(name) },
    customMetadata: { name, created: String(created) },
  });
  return { id, name, size: bytes.byteLength, url: fileUrl(origin, id, name), expiresAt: new Date(created + ttlMs(env)).toISOString() };
}

/** Fetch a stored file, deleting it when it has outlived the retention period. */
export async function getStored(env: Env, id: string): Promise<R2ObjectBody | null> {
  if (!ID.test(id)) return null;
  const object = await env.FILES.get(`f/${id}`);
  if (!object) return null;
  const created = Number(object.customMetadata?.created || object.uploaded.getTime());
  if (Date.now() - created > ttlMs(env)) {
    await env.FILES.delete(`f/${id}`);
    return null;
  }
  return object;
}

async function readLimited(response: Response, limit: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") || "0");
  if (declared > limit) throw new ToolError(`File is larger than ${limit / 1024 / 1024} MB.`);
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new ToolError(`File is larger than ${limit / 1024 / 1024} MB.`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function nameFromResponse(response: Response, url: URL): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (star) return cleanName(decodeURIComponent(star[1]));
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  if (plain) return cleanName(plain[1]);
  return cleanName(decodeURIComponent(url.pathname.split("/").pop() || ""), "download");
}

/** Resolve a file ID, one of our own download links, or a public https URL. */
export async function loadInput(env: Env, origin: string, ref: string): Promise<{ name: string; bytes: Uint8Array }> {
  ref = ref.trim();
  let id: string | null = ID.test(ref) ? ref : null;
  let url: URL | null = null;
  if (!id) {
    try {
      url = new URL(ref);
    } catch {
      throw new ToolError("file must be a HanX file ID (hx_...) or an https:// URL. The user can upload a file at " + origin + "/upload");
    }
    const own = /^\/f\/(hx_[a-z0-9]{24})(?:\/|$)/.exec(url.pathname);
    if (own && url.origin === origin) id = own[1];
  }
  if (id) {
    const object = await getStored(env, id);
    if (!object) throw new ToolError(`File ${id} was not found or has expired. Ask the user to upload it again at ${origin}/upload`);
    return { name: object.customMetadata?.name || "file", bytes: new Uint8Array(await object.arrayBuffer()) };
  }
  if (!url || url.protocol !== "https:") throw new ToolError("Only https:// URLs can be fetched.");
  const response = await fetch(url.toString(), { redirect: "follow", headers: { "user-agent": "HanX-Cloud/1" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new ToolError(`Could not download the file (HTTP ${response.status}).`);
  return { name: nameFromResponse(response, url), bytes: await readLimited(response, maxBytes(env)) };
}

export async function readUpload(env: Env, request: Request): Promise<{ name: string; bytes: Uint8Array }> {
  const limit = maxBytes(env);
  if (Number(request.headers.get("content-length") || "0") > limit + 64 * 1024) throw new ToolError(`File is larger than ${limit / 1024 / 1024} MB.`);
  const type = request.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw new ToolError("Choose a file to upload.");
    if (file.size > limit) throw new ToolError(`File is larger than ${limit / 1024 / 1024} MB.`);
    return { name: cleanName(file.name, "upload"), bytes: new Uint8Array(await file.arrayBuffer()) };
  }
  const name = new URL(request.url).searchParams.get("name");
  if (!name) throw new ToolError("Add ?name=file.ext to a raw upload.");
  return { name: cleanName(name, "upload"), bytes: await readLimited(new Response(request.body), limit) };
}
