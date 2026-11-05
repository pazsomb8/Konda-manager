import path from "node:path";
import { buildServer } from "./api/server.js";
import { SessionStore } from "./auth/sessions.js";
import { BalanceService } from "./balances/balanceService.js";
import { loadEnv, REPO_ROOT, resolveDataPath } from "./config/env.js";
import { openDatabase } from "./db/database.js";
import { SettingsRepo } from "./db/settingsRepo.js";
import { WalletRepo } from "./db/walletRepo.js";
import { Keystore } from "./keystore/keystore.js";
import { RpcManager } from "./rpc/rpcManager.js";
import { redact } from "./util/redact.js";
import { WalletService } from "./wallets/walletService.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const isProd = env.NODE_ENV === "production";

  const keystore = Keystore.open(resolveDataPath(env.KEYSTORE_PATH), env.KEYSTORE_PASSWORD);
  const db = openDatabase(resolveDataPath(env.DB_PATH));
  const walletRepo = new WalletRepo(db);
  const settings = new SettingsRepo(db);

  const rpc = new RpcManager({
    primary: { httpUrl: env.RPC_PRIMARY_URL, wsUrl: env.RPC_PRIMARY_WS },
    fallback: env.RPC_FALLBACK_URL ? { httpUrl: env.RPC_FALLBACK_URL, wsUrl: env.RPC_FALLBACK_WS } : undefined,
    primaryCooldownMs: env.RPC_PRIMARY_COOLDOWN_MS,
    timeoutMs: env.RPC_TIMEOUT_MS,
  });

  const wallets = new WalletService(walletRepo, keystore);
  for (const issue of wallets.integrityIssues()) console.warn(`[keystore] ${issue}`);

  const balances = new BalanceService(rpc, () => wallets.list());
  const sessionTtlMs = env.SESSION_TTL_HOURS * 3_600_000;

  const app = await buildServer({
    passwordHash: env.DASHBOARD_PASSWORD_HASH,
    sessions: new SessionStore(sessionTtlMs),
    sessionTtlMs,
    wallets,
    balances,
    settings,
    rpc,
    staticDir: isProd ? path.join(REPO_ROOT, "apps/web/dist") : undefined,
    logger: true,
  });

  // In production the backend owns the public port; in dev Vite does and proxies to API_PORT.
  const port = isProd ? env.PORT : env.API_PORT;
  await app.listen({ host: env.HOST, port });
  const url = `http://${env.HOST === "::1" ? "[::1]" : env.HOST}:${env.PORT}`;
  console.log(`\n  Konda Manager ${isProd ? "" : "(dev) "}running at ${url}\n`);

  const shutdown = async () => {
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  console.error(redact(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
