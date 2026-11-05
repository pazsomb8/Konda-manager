export function fmtSol(sol: number, digits = 4): string {
  return sol.toLocaleString("hu-HU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function solscanAccount(addr: string): string {
  return `https://solscan.io/account/${addr}`;
}

export function fmtTime(iso: string | null): string {
  if (!iso) return "még nem volt";
  return new Date(iso).toLocaleString("hu-HU");
}
