import { Connection, type Commitment } from "@solana/web3.js";
import type { RpcStatusDto } from "@konda/shared";
import { redact, urlHost } from "../util/redact.js";

export interface RpcEndpoint {
  httpUrl: string;
  wsUrl?: string;
}

export interface RpcManagerOptions {
  primary: RpcEndpoint;
  fallback?: RpcEndpoint;
  /** After a primary failure, prefer the fallback for this long. */
  primaryCooldownMs: number;
  timeoutMs: number;
  commitment?: Commitment;
  /** Injectable for tests. */
  connectionFactory?: (endpoint: RpcEndpoint, commitment: Commitment, timeoutMs: number) => Connection;
  now?: () => number;
}

type Which = "primary" | "fallback";

/**
 * Holds a primary and an optional fallback RPC connection and fails over
 * between them on transport-level errors.
 *
 * There is deliberately no background health-check: the primary is retried
 * only on the next real request after the cooldown expires, so no credits
 * are spent while the dashboard is idle.
 */
export class RpcManager {
  private readonly primary: Connection;
  private readonly fallback: Connection | null;
  private primaryFailedAt: number | null = null;
  private lastError: string | null = null;
  private lastUsed: Which = "primary";
  /** True when the last call failed on every endpoint. */
  private allFailed = false;
  private readonly now: () => number;

  constructor(private readonly opts: RpcManagerOptions) {
    const commitment = opts.commitment ?? "confirmed";
    const factory = opts.connectionFactory ?? defaultConnectionFactory;
    this.primary = factory(opts.primary, commitment, opts.timeoutMs);
    this.fallback = opts.fallback ? factory(opts.fallback, commitment, opts.timeoutMs) : null;
    this.now = opts.now ?? Date.now;
  }

  /**
   * Run an RPC call with failover. The callback may be invoked twice
   * (primary, then fallback), so it must be safe to repeat. Do NOT use this
   * for sendRawTransaction of a signed tx unless re-sending is intended
   * (re-sending the same signed tx is idempotent on Solana, so it is fine).
   */
  async call<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
    const order = this.order();
    let lastErr: unknown;
    for (const which of order) {
      const conn = which === "primary" ? this.primary : this.fallback;
      if (!conn) continue;
      try {
        const result = await fn(conn);
        this.lastUsed = which;
        this.allFailed = false;
        if (which === "primary") this.primaryFailedAt = null;
        return result;
      } catch (err) {
        lastErr = err;
        if (!isFailoverError(err)) throw err;
        this.lastError = redact(errorMessage(err));
        if (which === "primary") this.primaryFailedAt = this.now();
      }
    }
    this.allFailed = true;
    throw new Error(`All RPC endpoints failed: ${redact(errorMessage(lastErr))}`, { cause: lastErr });
  }

  /** The connection currently preferred, e.g. for WebSocket subscriptions. */
  get preferred(): Connection {
    return this.order()[0] === "fallback" && this.fallback ? this.fallback : this.primary;
  }

  status(): RpcStatusDto {
    return {
      active: this.lastUsed,
      allFailed: this.allFailed,
      primaryUrlHost: urlHost(this.opts.primary.httpUrl) ?? "",
      fallbackUrlHost: urlHost(this.opts.fallback?.httpUrl),
      lastError: this.lastError,
    };
  }

  private order(): Which[] {
    const inCooldown =
      this.primaryFailedAt !== null && this.now() - this.primaryFailedAt < this.opts.primaryCooldownMs;
    if (inCooldown && this.fallback) return ["fallback", "primary"];
    return this.fallback ? ["primary", "fallback"] : ["primary"];
  }
}

function defaultConnectionFactory(endpoint: RpcEndpoint, commitment: Commitment, timeoutMs: number): Connection {
  return new Connection(endpoint.httpUrl, {
    commitment,
    wsEndpoint: endpoint.wsUrl,
    disableRetryOnRateLimit: true, // we fail over instead of sleeping
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) }),
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Transport problems (network, timeout, rate limit, 5xx) justify trying the
 * other endpoint. Application-level RPC errors (bad params, simulation
 * failure) would fail the same way on both, so they are rethrown.
 */
export function isFailoverError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError" || name === "AbortError") return true;
  return [
    "fetch failed",
    "econnrefused",
    "econnreset",
    "enotfound",
    "etimedout",
    "socket hang up",
    "network",
    "429",
    "too many requests",
    "502",
    "503",
    "504",
    "500 internal",
    "timeout",
  ].some((needle) => msg.includes(needle));
}
