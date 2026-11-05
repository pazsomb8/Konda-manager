import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { existsSync } from "node:fs";
import { z } from "zod";
import type { ApiError } from "@konda/shared";
import { verifyPassword } from "../auth/password.js";
import type { SessionStore } from "../auth/sessions.js";
import type { BalanceService } from "../balances/balanceService.js";
import type { SettingsRepo } from "../db/settingsRepo.js";
import { KeystoreError } from "../keystore/keystore.js";
import type { RpcManager } from "../rpc/rpcManager.js";
import { redact } from "../util/redact.js";
import { WalletError, type WalletService } from "../wallets/walletService.js";

export interface ServerDeps {
  passwordHash: string;
  sessions: SessionStore;
  sessionTtlMs: number;
  wallets: WalletService;
  balances: BalanceService;
  settings: SettingsRepo;
  rpc: RpcManager;
  /** Built UI to serve (production). Undefined in dev, where Vite serves it. */
  staticDir?: string;
  logger?: boolean;
}

const SESSION_COOKIE = "konda_session";
const ALLOWED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

const createWalletBody = z.object({
  label: z.string().min(1).max(64),
  role: z.enum(["main", "follower"]),
  secretKey: z.string().min(1).optional(),
});

const updateWalletBody = z
  .object({
    label: z.string().min(1).max(64),
    enabled: z.boolean(),
    copyBuySol: z.number().nonnegative().max(1000),
    slippageBps: z.number().int().min(0).max(10_000).nullable(),
    priorityFeeMicroLamports: z.number().int().nonnegative().nullable(),
  })
  .partial()
  .strict();

const settingsBody = z
  .object({
    slippageBps: z.number().int().min(0).max(10_000),
    priorityFeeMicroLamports: z.number().int().nonnegative(),
    dryRun: z.boolean(),
  })
  .partial()
  .strict();

const idParam = z.object({ id: z.coerce.number().int().positive() });

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger
      ? {
          // Request bodies are never logged; headers carrying the session are redacted.
          redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
        }
      : false,
    bodyLimit: 64 * 1024,
  });

  await app.register(cookie);

  // DNS-rebinding / CSRF protection: only accept requests addressed to a
  // loopback host, and state-changing requests only from our own origin.
  app.addHook("onRequest", async (req, reply) => {
    const hostname = hostnameOf(req.headers.host);
    if (!hostname || !ALLOWED_HOSTNAMES.has(hostname)) {
      return reply.code(403).send({ error: "Forbidden host" } satisfies ApiError);
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      const origin = req.headers.origin;
      if (origin && !ALLOWED_HOSTNAMES.has(hostnameOf(safeUrlHost(origin)) ?? "")) {
        return reply.code(403).send({ error: "Forbidden origin" } satisfies ApiError);
      }
    }
  });

  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!deps.sessions.isValid(req.cookies[SESSION_COOKIE])) {
      return reply.code(401).send({ error: "Not logged in" } satisfies ApiError);
    }
  };

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof WalletError) return reply.code(err.status).send({ error: err.message });
    if (err instanceof KeystoreError) return reply.code(400).send({ error: err.message });
    if (err instanceof z.ZodError) {
      return reply.code(400).send({ error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const message = redact(err instanceof Error ? err.message : String(err));
    req.log.error({ err: { message, stack: err instanceof Error ? redact(err.stack ?? "") : undefined } });
    return reply.code(status).send({ error: status >= 500 ? `Server error: ${message}` : message });
  });

  // ---- auth (public) ----
  let failedLogins = 0;
  app.post("/api/auth/login", async (req, reply) => {
    const { password } = z.object({ password: z.string().min(1).max(256) }).parse(req.body);
    // Simple brute-force brake: growing delay after failures.
    if (failedLogins > 0) await sleep(Math.min(failedLogins * 500, 5000));
    if (!verifyPassword(password, deps.passwordHash)) {
      failedLogins++;
      return reply.code(401).send({ error: "Wrong password" } satisfies ApiError);
    }
    failedLogins = 0;
    const token = deps.sessions.create();
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: Math.floor(deps.sessionTtlMs / 1000),
    });
    return { ok: true };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    deps.sessions.destroy(req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req) => ({ loggedIn: deps.sessions.isValid(req.cookies[SESSION_COOKIE]) }));

  // ---- protected API ----
  await app.register(async (api) => {
    api.addHook("preHandler", requireAuth);

    api.get("/api/status", async () => ({
      rpc: deps.rpc.status(),
      integrityIssues: deps.wallets.integrityIssues(),
    }));

    api.get("/api/wallets", async () => deps.wallets.list());

    api.post("/api/wallets", async (req, reply) => {
      const body = createWalletBody.parse(req.body);
      const wallet = deps.wallets.create(body);
      return reply.code(201).send(wallet);
    });

    api.patch("/api/wallets/:id", async (req) => {
      const { id } = idParam.parse(req.params);
      return deps.wallets.update(id, updateWalletBody.parse(req.body));
    });

    api.delete("/api/wallets/:id", async (req) => {
      const { id } = idParam.parse(req.params);
      const wallet = deps.wallets.list().find((w) => w.id === id);
      deps.wallets.remove(id);
      if (wallet) deps.balances.forget(wallet.pubkey);
      return { ok: true };
    });

    // Cached values only: no RPC call.
    api.get("/api/balances", async () => deps.balances.snapshot());
    // The "Frissítés" button: one getMultipleAccounts for all wallets.
    api.post("/api/balances/refresh", async () => deps.balances.refreshAll());

    api.get("/api/settings", async () => deps.settings.get());
    api.patch("/api/settings", async (req) => deps.settings.update(settingsBody.parse(req.body)));
  });

  if (deps.staticDir && existsSync(deps.staticDir)) {
    await app.register(fastifyStatic, { root: deps.staticDir });
    // SPA fallback for client-side routes.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
  }

  return app;
}

function hostnameOf(host: string | undefined | null): string | null {
  if (!host) return null;
  if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1);
  return host.split(":")[0] ?? null;
}

function safeUrlHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
