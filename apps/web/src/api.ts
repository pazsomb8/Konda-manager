import type {
  BalanceSnapshotDto,
  CreateWalletRequest,
  GlobalSettingsDto,
  RpcStatusDto,
  UpdateWalletRequest,
  WalletDto,
} from "@konda/shared";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiRequestError(data.error ?? `HTTP ${res.status}`, res.status);
  return data as T;
}

export const api = {
  me: () => request<{ loggedIn: boolean }>("GET", "/api/auth/me"),
  login: (password: string) => request<{ ok: true }>("POST", "/api/auth/login", { password }),
  logout: () => request<{ ok: true }>("POST", "/api/auth/logout"),

  status: () => request<{ rpc: RpcStatusDto; integrityIssues: string[] }>("GET", "/api/status"),

  wallets: () => request<WalletDto[]>("GET", "/api/wallets"),
  createWallet: (req: CreateWalletRequest) => request<WalletDto>("POST", "/api/wallets", req),
  updateWallet: (id: number, patch: UpdateWalletRequest) => request<WalletDto>("PATCH", `/api/wallets/${id}`, patch),
  deleteWallet: (id: number) => request<{ ok: true }>("DELETE", `/api/wallets/${id}`),

  balances: () => request<BalanceSnapshotDto>("GET", "/api/balances"),
  refreshBalances: () => request<BalanceSnapshotDto>("POST", "/api/balances/refresh"),

  settings: () => request<GlobalSettingsDto>("GET", "/api/settings"),
  updateSettings: (patch: Partial<GlobalSettingsDto>) => request<GlobalSettingsDto>("PATCH", "/api/settings", patch),
};
