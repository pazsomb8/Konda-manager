import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Keystore, KeystoreError, parseSecretKey } from "../src/keystore/keystore.js";

const tmpFile = () => path.join(mkdtempSync(path.join(tmpdir(), "konda-ks-")), "keystore.enc");

describe("Keystore", () => {
  it("round-trips keys through the encrypted file", () => {
    const file = tmpFile();
    const kp = Keypair.generate();
    Keystore.open(file, "correct horse battery").add(kp);

    const reopened = Keystore.open(file, "correct horse battery");
    expect(reopened.getKeypair(kp.publicKey.toBase58()).secretKey).toEqual(kp.secretKey);
  });

  it("does not store the secret in plaintext", () => {
    const file = tmpFile();
    const kp = Keypair.generate();
    Keystore.open(file, "correct horse battery").add(kp);
    const raw = readFileSync(file, "utf8");
    expect(raw).not.toContain(bs58.encode(kp.secretKey));
    expect(raw).not.toContain(kp.publicKey.toBase58());
  });

  it("rejects a wrong password", () => {
    const file = tmpFile();
    Keystore.open(file, "correct horse battery").add(Keypair.generate());
    expect(() => Keystore.open(file, "wrong password!!")).toThrow(KeystoreError);
  });

  it("removes keys", () => {
    const file = tmpFile();
    const ks = Keystore.open(file, "correct horse battery");
    const pub = ks.add(Keypair.generate());
    ks.remove(pub);
    expect(Keystore.open(file, "correct horse battery").has(pub)).toBe(false);
  });
});

describe("parseSecretKey", () => {
  it("accepts base58 and JSON array formats", () => {
    const kp = Keypair.generate();
    expect(parseSecretKey(bs58.encode(kp.secretKey)).publicKey.equals(kp.publicKey)).toBe(true);
    expect(parseSecretKey(JSON.stringify([...kp.secretKey])).publicKey.equals(kp.publicKey)).toBe(true);
  });

  it("does not echo invalid input in the error", () => {
    try {
      parseSecretKey("not-a-real-key-SECRETVALUE");
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain("SECRETVALUE");
    }
  });
});
