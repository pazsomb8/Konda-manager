// Types shared between the backend API and the React UI.
// Never put secret material (private keys, passwords) in these types.

export type WalletRole = "main" | "follower";

export interface WalletDto {
  id: number;
  pubkey: string;
  label: string;
  role: WalletRole;
  /** Followers only: whether copy-trading is active for this wallet. */
  enabled: boolean;
  /** SOL amount a follower spends on each copy-buy. */
  copyBuySol: number;
  /** Per-wallet override; null means "use the global setting". */
  slippageBps: number | null;
  /** Per-wallet override in micro-lamports per CU; null means global. */
  priorityFeeMicroLamports: number | null;
  createdAt: string;
}

export interface WalletBalanceDto {
  walletId: number;
  pubkey: string;
  label: string;
  role: WalletRole;
  lamports: number;
  sol: number;
}

export interface BalanceSnapshotDto {
  totalLamports: number;
  totalSol: number;
  wallets: WalletBalanceDto[];
  /** ISO timestamp of the last refresh, null if never refreshed. */
  refreshedAt: string | null;
}

export interface CreateWalletRequest {
  label: string;
  role: WalletRole;
  /** Base58 secret key or JSON byte array. Omit to generate a new keypair. */
  secretKey?: string;
}

export interface UpdateWalletRequest {
  label?: string;
  enabled?: boolean;
  copyBuySol?: number;
  slippageBps?: number | null;
  priorityFeeMicroLamports?: number | null;
}

export interface GlobalSettingsDto {
  slippageBps: number;
  priorityFeeMicroLamports: number;
  dryRun: boolean;
}

export interface RpcStatusDto {
  active: "primary" | "fallback";
  /** The last call failed on every configured endpoint. */
  allFailed: boolean;
  primaryUrlHost: string;
  fallbackUrlHost: string | null;
  lastError: string | null;
}

export interface ApiError {
  error: string;
}

export const LAMPORTS_PER_SOL = 1_000_000_000;
