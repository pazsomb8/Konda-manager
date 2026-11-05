import type { Connection } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { RpcManager } from "../src/rpc/rpcManager.js";

function setup(now: { t: number }) {
  const conns: Record<string, Connection> = {};
  const rpc = new RpcManager({
    primary: { httpUrl: "https://primary.example.com/?api-key=SECRET" },
    fallback: { httpUrl: "https://fallback.example.com" },
    primaryCooldownMs: 60_000,
    timeoutMs: 1000,
    now: () => now.t,
    connectionFactory: (ep) => {
      const c = { name: ep.httpUrl.includes("primary") ? "primary" : "fallback" } as unknown as Connection;
      conns[(c as unknown as { name: string }).name] = c;
      return c;
    },
  });
  const nameOf = (c: Connection) => (c as unknown as { name: string }).name;
  return { rpc, nameOf };
}

describe("RpcManager", () => {
  it("fails over to the fallback on network errors and prefers it during cooldown", async () => {
    const now = { t: 0 };
    const { rpc, nameOf } = setup(now);
    const calls: string[] = [];
    let primaryDown = true;
    const fn = async (c: Connection) => {
      calls.push(nameOf(c));
      if (nameOf(c) === "primary" && primaryDown) throw new Error("fetch failed");
      return nameOf(c);
    };

    expect(await rpc.call(fn)).toBe("fallback");
    expect(calls).toEqual(["primary", "fallback"]);

    calls.length = 0;
    expect(await rpc.call(fn)).toBe("fallback");
    expect(calls).toEqual(["fallback"]); // cooldown: primary skipped

    now.t = 61_000;
    primaryDown = false;
    calls.length = 0;
    expect(await rpc.call(fn)).toBe("primary");
    expect(rpc.status().active).toBe("primary");
  });

  it("does not fail over on application errors", async () => {
    const { rpc, nameOf } = setup({ t: 0 });
    const calls: string[] = [];
    await expect(
      rpc.call(async (c) => {
        calls.push(nameOf(c));
        throw new Error("Invalid param: WrongSize");
      }),
    ).rejects.toThrow("Invalid param");
    expect(calls).toEqual(["primary"]);
  });

  it("never exposes the API key in status", () => {
    const { rpc } = setup({ t: 0 });
    expect(JSON.stringify(rpc.status())).not.toContain("SECRET");
  });
});

describe("RpcManager all endpoints down", () => {
  it("reports allFailed and wraps the error", async () => {
    const { rpc } = setup({ t: 0 });
    await expect(rpc.call(async () => Promise.reject(new Error("fetch failed")))).rejects.toThrow(
      "All RPC endpoints failed",
    );
    expect(rpc.status().allFailed).toBe(true);
    await rpc.call(async () => "ok");
    expect(rpc.status().allFailed).toBe(false);
  });
});
