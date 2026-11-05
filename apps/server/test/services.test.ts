import { Keypair, type Connection, type PublicKey } from "@solana/web3.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BalanceService } from "../src/balances/balanceService.js";
import { openDatabase } from "../src/db/database.js";
import { WalletRepo } from "../src/db/walletRepo.js";
import { Keystore } from "../src/keystore/keystore.js";
import { RpcManager } from "../src/rpc/rpcManager.js";
import { WalletService } from "../src/wallets/walletService.js";

function makeWallets() {
  const dir = mkdtempSync(path.join(tmpdir(), "konda-svc-"));
  const ks = Keystore.open(path.join(dir, "ks.enc"), "correct horse battery");
  const db = openDatabase(":memory:");
  return { svc: new WalletService(new WalletRepo(db), ks), ks };
}

describe("WalletService", () => {
  it("creates one main wallet and followers, stores keys in the keystore", () => {
    const { svc, ks } = makeWallets();
    const main = svc.create({ label: "Main", role: "main" });
    expect(ks.has(main.pubkey)).toBe(true);
    expect(() => svc.create({ label: "Main 2", role: "main" })).toThrow(/main wallet already exists/);
    const f = svc.create({ label: "F1", role: "follower" });
    expect(svc.list().map((w) => w.id)).toEqual([main.id, f.id]);
    expect(svc.integrityIssues()).toEqual([]);
  });

  it("rejects duplicate imports and removes keys on delete", () => {
    const { svc, ks } = makeWallets();
    const kp = Keypair.generate();
    const secret = JSON.stringify([...kp.secretKey]);
    const w = svc.create({ label: "A", role: "follower", secretKey: secret });
    expect(() => svc.create({ label: "B", role: "follower", secretKey: secret })).toThrow(/already added/);
    svc.remove(w.id);
    expect(ks.has(w.pubkey)).toBe(false);
  });

  it("toggles followers and validates overrides", () => {
    const { svc } = makeWallets();
    const f = svc.create({ label: "F", role: "follower" });
    expect(svc.update(f.id, { enabled: false, copyBuySol: 0.25 })).toMatchObject({ enabled: false, copyBuySol: 0.25 });
    expect(() => svc.update(f.id, { slippageBps: 20_000 })).toThrow();
    expect(svc.update(f.id, { slippageBps: null }).slippageBps).toBeNull();
  });
});

describe("BalanceService", () => {
  it("fetches all wallets in batches of 100 and sums lamports", async () => {
    const batches: number[] = [];
    const fakeConn = {
      getMultipleAccountsInfo: async (keys: PublicKey[]) => {
        batches.push(keys.length);
        return keys.map((_, i) => (i % 2 === 0 ? { lamports: 1_000_000_000 } : null));
      },
    } as unknown as Connection;
    const rpc = new RpcManager({
      primary: { httpUrl: "https://x.example.com" },
      primaryCooldownMs: 0,
      timeoutMs: 1000,
      connectionFactory: () => fakeConn,
    });
    const wallets = Array.from({ length: 150 }, (_, i) => ({
      id: i + 1,
      pubkey: Keypair.generate().publicKey.toBase58(),
      label: `W${i}`,
      role: "follower" as const,
      enabled: true,
      copyBuySol: 0.1,
      slippageBps: null,
      priorityFeeMicroLamports: null,
      createdAt: "",
    }));
    const svc = new BalanceService(rpc, () => wallets);
    expect(svc.snapshot().refreshedAt).toBeNull();
    const snap = await svc.refreshAll();
    expect(batches).toEqual([100, 50]);
    expect(snap.totalSol).toBe(75); // 50 + 25 funded wallets
    expect(snap.refreshedAt).not.toBeNull();
  });
});
