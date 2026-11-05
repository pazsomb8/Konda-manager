import { Keypair } from "@solana/web3.js";
import type { CreateWalletRequest, UpdateWalletRequest, WalletDto } from "@konda/shared";
import type { WalletRepo } from "../db/walletRepo.js";
import { parseSecretKey, type Keystore } from "../keystore/keystore.js";

export class WalletError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/**
 * Wallet lifecycle: metadata lives in SQLite, secret keys in the encrypted
 * keystore. The two are kept in sync here and nowhere else.
 */
export class WalletService {
  constructor(
    private readonly repo: WalletRepo,
    private readonly keystore: Keystore,
  ) {}

  /** Report wallets whose metadata exists but whose key is missing (or vice versa). */
  integrityIssues(): string[] {
    const issues: string[] = [];
    const known = new Set(this.repo.list().map((w) => w.pubkey));
    for (const w of known) if (!this.keystore.has(w)) issues.push(`Wallet ${w} has no key in the keystore`);
    for (const k of this.keystore.pubkeys())
      if (!known.has(k)) issues.push(`Keystore holds a key for unknown wallet ${k}`);
    return issues;
  }

  list(): WalletDto[] {
    return this.repo.list();
  }

  main(): WalletDto | null {
    return this.repo.list().find((w) => w.role === "main") ?? null;
  }

  create(req: CreateWalletRequest): WalletDto {
    const label = req.label.trim();
    if (!label) throw new WalletError("Label is required");
    if (req.role === "main" && this.repo.hasMain()) {
      throw new WalletError("A main wallet already exists. Remove it first.", 409);
    }
    const keypair = req.secretKey ? parseSecretKey(req.secretKey) : Keypair.generate();
    const pubkey = keypair.publicKey.toBase58();
    if (this.repo.findByPubkey(pubkey)) throw new WalletError("This wallet is already added", 409);

    // Key first: a wallet row without a key would be unusable.
    this.keystore.add(keypair);
    try {
      return this.repo.insert({ pubkey, label, role: req.role });
    } catch (err) {
      this.keystore.remove(pubkey);
      throw err;
    }
  }

  update(id: number, patch: UpdateWalletRequest): WalletDto {
    if (patch.label !== undefined && !patch.label.trim()) throw new WalletError("Label cannot be empty");
    if (patch.copyBuySol !== undefined && !(patch.copyBuySol >= 0)) throw new WalletError("Invalid SOL amount");
    if (patch.slippageBps != null && (patch.slippageBps < 0 || patch.slippageBps > 10_000))
      throw new WalletError("Slippage must be between 0 and 10000 bps");
    if (patch.priorityFeeMicroLamports != null && patch.priorityFeeMicroLamports < 0)
      throw new WalletError("Priority fee cannot be negative");
    const updated = this.repo.update(id, { ...patch, label: patch.label?.trim() });
    if (!updated) throw new WalletError("Wallet not found", 404);
    return updated;
  }

  remove(id: number): void {
    const w = this.repo.get(id);
    if (!w) throw new WalletError("Wallet not found", 404);
    this.repo.delete(id);
    this.keystore.remove(w.pubkey);
  }
}
