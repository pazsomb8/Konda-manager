import type { Connection } from "@solana/web3.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildServer } from "../src/api/server.js";
import { hashPassword } from "../src/auth/password.js";
import { SessionStore } from "../src/auth/sessions.js";
import { BalanceService } from "../src/balances/balanceService.js";
import { openDatabase } from "../src/db/database.js";
import { SettingsRepo } from "../src/db/settingsRepo.js";
import { WalletRepo } from "../src/db/walletRepo.js";
import { Keystore } from "../src/keystore/keystore.js";
import { RpcManager } from "../src/rpc/rpcManager.js";
import { WalletService } from "../src/wallets/walletService.js";

async function makeApp() {
  const dir = mkdtempSync(path.join(tmpdir(), "konda-api-"));
  const db = openDatabase(":memory:");
  const wallets = new WalletService(new WalletRepo(db), Keystore.open(path.join(dir, "ks.enc"), "correct horse battery"));
  const rpc = new RpcManager({
    primary: { httpUrl: "https://x.example.com" },
    primaryCooldownMs: 0,
    timeoutMs: 1000,
    connectionFactory: () =>
      ({ getMultipleAccountsInfo: async (k: unknown[]) => k.map(() => ({ lamports: 5e8 })) }) as unknown as Connection,
  });
  return buildServer({
    passwordHash: hashPassword("letmein123"),
    sessions: new SessionStore(60_000),
    sessionTtlMs: 60_000,
    wallets,
    balances: new BalanceService(rpc, () => wallets.list()),
    settings: new SettingsRepo(db),
    rpc,
  });
}

const H = { host: "127.0.0.1:8001" };

describe("API", () => {
  it("requires login and never returns secret keys", async () => {
    const app = await makeApp();
    expect((await app.inject({ method: "GET", url: "/api/wallets", headers: H })).statusCode).toBe(401);

    const bad = await app.inject({ method: "POST", url: "/api/auth/login", headers: H, payload: { password: "nope" } });
    expect(bad.statusCode).toBe(401);

    const login = await app.inject({ method: "POST", url: "/api/auth/login", headers: H, payload: { password: "letmein123" } });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies.find((c) => c.name === "konda_session")!;
    expect(cookie.httpOnly).toBe(true);
    const auth = { ...H, cookie: `konda_session=${cookie.value}` };

    const created = await app.inject({ method: "POST", url: "/api/wallets", headers: auth, payload: { label: "Main", role: "main" } });
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toMatch(/secret/i);

    const refreshed = await app.inject({ method: "POST", url: "/api/balances/refresh", headers: auth });
    expect(refreshed.json()).toMatchObject({ totalSol: 0.5 });
  });

  it("rejects non-loopback hosts and foreign origins", async () => {
    const app = await makeApp();
    expect((await app.inject({ method: "GET", url: "/api/auth/me", headers: { host: "evil.com" } })).statusCode).toBe(403);
    const r = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { ...H, origin: "https://evil.com" },
      payload: { password: "letmein123" },
    });
    expect(r.statusCode).toBe(403);
  });
});
