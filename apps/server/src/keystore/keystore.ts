import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Encrypted on-disk store of wallet secret keys.
 *
 * File format (JSON): { v, kdf: {N,r,p,salt}, iv, tag, data } where `data`
 * is AES-256-GCM ciphertext of a JSON map { pubkey: base58SecretKey }.
 * The key is derived from KEYSTORE_PASSWORD with scrypt. A fresh salt and IV
 * are used on every write.
 *
 * Secrets only ever exist decrypted in this process's memory. Nothing in
 * this class logs or returns secret material except `getKeypair`, which is
 * for the signing code paths in the backend.
 */

const SCRYPT = { N: 1 << 15, r: 8, p: 1 } as const;
const KEY_LEN = 32;

interface KeystoreFile {
  v: 1;
  kdf: { N: number; r: number; p: number; salt: string };
  iv: string;
  tag: string;
  data: string;
}

export class KeystoreError extends Error {}

export class Keystore {
  private keys = new Map<string, Keypair>();

  private constructor(
    private readonly filePath: string,
    private readonly password: string,
  ) {}

  /** Open (or create) the keystore. Throws on a wrong password. */
  static open(filePath: string, password: string): Keystore {
    const ks = new Keystore(filePath, password);
    if (existsSync(filePath)) ks.load();
    return ks;
  }

  has(pubkey: string): boolean {
    return this.keys.has(pubkey);
  }

  pubkeys(): string[] {
    return [...this.keys.keys()];
  }

  /** For backend signing only. Never send the result anywhere. */
  getKeypair(pubkey: string): Keypair {
    const kp = this.keys.get(pubkey);
    if (!kp) throw new KeystoreError(`No key for wallet ${pubkey}`);
    return kp;
  }

  /** Add a keypair and persist. Returns the public key. */
  add(keypair: Keypair): string {
    const pubkey = keypair.publicKey.toBase58();
    this.keys.set(pubkey, keypair);
    this.save();
    return pubkey;
  }

  remove(pubkey: string): void {
    if (this.keys.delete(pubkey)) this.save();
  }

  private load(): void {
    let file: KeystoreFile;
    try {
      file = JSON.parse(readFileSync(this.filePath, "utf8")) as KeystoreFile;
    } catch {
      throw new KeystoreError("Keystore file is not valid JSON");
    }
    if (file.v !== 1) throw new KeystoreError(`Unsupported keystore version ${String(file.v)}`);
    const key = deriveKey(this.password, Buffer.from(file.kdf.salt, "base64"), file.kdf);
    let plaintext: string;
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(file.iv, "base64"));
      decipher.setAuthTag(Buffer.from(file.tag, "base64"));
      plaintext = Buffer.concat([decipher.update(Buffer.from(file.data, "base64")), decipher.final()]).toString(
        "utf8",
      );
    } catch {
      throw new KeystoreError("Cannot decrypt keystore: wrong KEYSTORE_PASSWORD or corrupted file");
    }
    const map = JSON.parse(plaintext) as Record<string, string>;
    this.keys = new Map(
      Object.entries(map).map(([pub, secret]) => [pub, Keypair.fromSecretKey(bs58.decode(secret))]),
    );
  }

  private save(): void {
    const map: Record<string, string> = {};
    for (const [pub, kp] of this.keys) map[pub] = bs58.encode(kp.secretKey);
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = deriveKey(this.password, salt, SCRYPT);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(map), "utf8"), cipher.final()]);
    const file: KeystoreFile = {
      v: 1,
      kdf: { ...SCRYPT, salt: salt.toString("base64") },
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    };
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    // Atomic replace so a crash mid-write cannot destroy the keystore.
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(file), { mode: 0o600 });
    renameSync(tmp, this.filePath);
  }
}

function deriveKey(password: string, salt: Buffer, p: { N: number; r: number; p: number }): Buffer {
  return scryptSync(password, salt, KEY_LEN, { N: p.N, r: p.r, p: p.p, maxmem: 128 * p.N * p.r * 2 });
}

/** Parse a user-supplied secret key: base58 string or JSON byte array (Solana CLI format). */
export function parseSecretKey(input: string): Keypair {
  const trimmed = input.trim();
  try {
    const bytes = trimmed.startsWith("[")
      ? Uint8Array.from(JSON.parse(trimmed) as number[])
      : bs58.decode(trimmed);
    if (bytes.length !== 64) throw new Error("length");
    return Keypair.fromSecretKey(bytes);
  } catch {
    // Do not include the input in the message.
    throw new KeystoreError("Invalid secret key: expected a 64-byte base58 string or JSON byte array");
  }
}
