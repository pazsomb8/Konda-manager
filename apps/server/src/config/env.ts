import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
/** Repository root (apps/server/src/config -> ../../../..). */
export const REPO_ROOT = path.resolve(here, "../../../..");

const envFile = path.join(REPO_ROOT, ".env");
if (existsSync(envFile)) loadDotenv({ path: envFile });

const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1"] as const;

const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .pipe(z.string().url().optional())
  .optional();

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // The dashboard must only be reachable from this machine.
  HOST: z.enum(LOOPBACK_HOSTS).default("127.0.0.1"),
  // In production the backend serves the UI on this port. In dev the Vite
  // server owns this port and proxies /api to API_PORT.
  PORT: z.coerce.number().int().positive().default(8001),
  API_PORT: z.coerce.number().int().positive().default(8002),

  RPC_PRIMARY_URL: z.string().url(),
  RPC_PRIMARY_WS: optionalUrl,
  RPC_FALLBACK_URL: optionalUrl,
  RPC_FALLBACK_WS: optionalUrl,
  /** How long to prefer the fallback after the primary failed. */
  RPC_PRIMARY_COOLDOWN_MS: z.coerce.number().int().nonnegative().default(60_000),
  RPC_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),

  KEYSTORE_PASSWORD: z.string().min(12, "KEYSTORE_PASSWORD must be at least 12 characters"),
  KEYSTORE_PATH: z.string().default("data/keystore.enc"),
  DB_PATH: z.string().default("data/konda.db"),

  DASHBOARD_PASSWORD_HASH: z
    .string()
    .regex(/^scrypt\$/, "DASHBOARD_PASSWORD_HASH must be generated with `pnpm hash-password`"),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration (.env):\n${issues}\nSee .env.example.`);
  }
  return parsed.data;
}

/** Resolve a path from .env relative to the repository root. */
export function resolveDataPath(p: string): string {
  return path.isAbsolute(p) ? p : path.join(REPO_ROOT, p);
}
