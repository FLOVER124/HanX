import { getRandom } from "@cloudflare/containers";
import type { Env } from "./env";
import { ToolError } from "./files";

export interface EngineRequest {
  tool: string;
  arguments: Record<string, unknown>;
  input?: { name: string; data: string };
  output?: { name: string };
}

export interface EngineResponse {
  result: { content?: { type: string; text?: string }[]; isError?: boolean };
  output: { name: string; data: string } | null;
}

export async function callEngine(env: Env, payload: EngineRequest): Promise<EngineResponse> {
  const init: RequestInit = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) };
  let response: Response;
  if (env.ENGINE_URL) {
    response = await fetch(new URL("/call", env.ENGINE_URL), init);
  } else if (env.ENGINE) {
    const instance = await getRandom(env.ENGINE, Number(env.ENGINE_INSTANCES || "3"));
    response = await instance.fetch(new Request("http://hanx-engine/call", init));
  } else {
    throw new ToolError("The HanX engine is not configured on this server.");
  }
  const body = (await response.json().catch(() => ({}))) as Partial<EngineResponse> & { error?: string };
  if (!response.ok) throw new ToolError(body.error || `HanX engine error (HTTP ${response.status})`);
  return body as EngineResponse;
}
