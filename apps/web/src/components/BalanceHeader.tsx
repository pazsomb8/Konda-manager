import type { BalanceSnapshotDto } from "@konda/shared";
import { fmtSol, fmtTime } from "../format";

interface Props {
  snapshot: BalanceSnapshotDto | null;
  refreshing: boolean;
  onRefresh: () => void;
}

/** Total SOL across all wallets, with a per-wallet breakdown. Refreshes only on click. */
export function BalanceHeader({ snapshot, refreshing, onRefresh }: Props) {
  return (
    <section className="card balance-header">
      <div className="balance-total">
        <div className="muted">Összes SOL (fő + követők)</div>
        <div className="big">{snapshot ? fmtSol(snapshot.totalSol) : "–"} SOL</div>
        <div className="muted small">Utolsó frissítés: {fmtTime(snapshot?.refreshedAt ?? null)}</div>
      </div>
      <button className="primary" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? "Frissítés…" : "Frissítés"}
      </button>
      {snapshot && snapshot.wallets.length > 0 && (
        <div className="balance-breakdown">
          {snapshot.wallets.map((w) => (
            <div key={w.walletId} className="chip">
              <span className={w.role === "main" ? "role main" : "role"}>{w.role === "main" ? "FŐ" : "K"}</span>
              <span>{w.label}</span>
              <strong>{fmtSol(w.sol)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
