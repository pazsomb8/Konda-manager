import { PublicKey, type AccountInfo, type Connection } from "@solana/web3.js";
import { LAMPORTS_PER_SOL, type BalanceSnapshotDto, type WalletDto } from "@konda/shared";
import type { RpcManager } from "../rpc/rpcManager.js";

/** getMultipleAccounts accepts at most 100 keys per request. */
export const MAX_ACCOUNTS_PER_CALL = 100;

/**
 * Fetch many accounts with the minimum number of RPC calls (one per 100 keys).
 * This is the single entry point for balance/price reads, so later
 * milestones add token ATAs and bonding-curve/pool accounts to the same batch.
 */
export async function getAccountsBatched(
  rpc: RpcManager,
  keys: PublicKey[],
): Promise<(AccountInfo<Buffer> | null)[]> {
  const out: (AccountInfo<Buffer> | null)[] = [];
  for (let i = 0; i < keys.length; i += MAX_ACCOUNTS_PER_CALL) {
    const chunk = keys.slice(i, i + MAX_ACCOUNTS_PER_CALL);
    const infos = await rpc.call((c: Connection) => c.getMultipleAccountsInfo(chunk));
    out.push(...infos);
  }
  return out;
}

/**
 * SOL balances of all wallets. Only refreshed on explicit request (the
 * "Frissítés" button or after an own trade): there is no timer anywhere.
 */
export class BalanceService {
  private lamports = new Map<string, number>();
  private refreshedAt: string | null = null;

  constructor(
    private readonly rpc: RpcManager,
    private readonly listWallets: () => WalletDto[],
  ) {}

  /** Refresh every wallet in one getMultipleAccounts call. */
  async refreshAll(): Promise<BalanceSnapshotDto> {
    const wallets = this.listWallets();
    await this.fetchInto(wallets.map((w) => w.pubkey));
    this.refreshedAt = new Date().toISOString();
    return this.snapshot();
  }

  /** Refresh only the given wallets (e.g. after an own trade). */
  async refreshWallets(pubkeys: string[]): Promise<BalanceSnapshotDto> {
    await this.fetchInto(pubkeys);
    return this.snapshot();
  }

  forget(pubkey: string): void {
    this.lamports.delete(pubkey);
  }

  /** Cached values only, no RPC call. */
  snapshot(): BalanceSnapshotDto {
    const wallets = this.listWallets().map((w) => {
      const lamports = this.lamports.get(w.pubkey) ?? 0;
      return {
        walletId: w.id,
        pubkey: w.pubkey,
        label: w.label,
        role: w.role,
        lamports,
        sol: lamports / LAMPORTS_PER_SOL,
      };
    });
    const totalLamports = wallets.reduce((s, w) => s + w.lamports, 0);
    return { totalLamports, totalSol: totalLamports / LAMPORTS_PER_SOL, wallets, refreshedAt: this.refreshedAt };
  }

  private async fetchInto(pubkeys: string[]): Promise<void> {
    if (pubkeys.length === 0) return;
    const infos = await getAccountsBatched(
      this.rpc,
      pubkeys.map((p) => new PublicKey(p)),
    );
    // A wallet that was never funded does not exist on-chain: balance 0.
    pubkeys.forEach((p, i) => this.lamports.set(p, infos[i]?.lamports ?? 0));
  }
}
