import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { SessionStore } from "../src/auth/sessions.js";
import { redact } from "../src/util/redact.js";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

describe("password hashing", () => {
  it("verifies the right password only", () => {
    const h = hashPassword("hunter2hunter2");
    expect(verifyPassword("hunter2hunter2", h)).toBe(true);
    expect(verifyPassword("hunter2hunter3", h)).toBe(false);
    expect(verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("SessionStore", () => {
  it("expires sessions", () => {
    let t = 0;
    const s = new SessionStore(1000, () => t);
    const tok = s.create();
    expect(s.isValid(tok)).toBe(true);
    t = 2000;
    expect(s.isValid(tok)).toBe(false);
    expect(s.isValid(undefined)).toBe(false);
  });
});

describe("redact", () => {
  it("scrubs secret keys and api keys", () => {
    const secret = bs58.encode(Keypair.generate().secretKey);
    const out = redact(`boom ${secret} https://rpc.example.com/?api-key=abc123`);
    expect(out).not.toContain(secret);
    expect(out).not.toContain("abc123");
  });
});
