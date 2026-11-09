import type { HanxEngine } from "./index";

export interface Env {
  FILES: R2Bucket;
  ENGINE?: DurableObjectNamespace<HanxEngine>;
  RATE_LIMITER?: RateLimit;
  /** Development only: call an engine at this URL instead of the container. */
  ENGINE_URL?: string;
  ENGINE_INSTANCES?: string;
  FILE_TTL_HOURS?: string;
  MAX_FILE_MB?: string;
  /** Optional comma-separated access keys. When set, /mcp and /upload require one. */
  ACCESS_TOKENS?: string;
}
