import { useCallback, useEffect, useState } from "react";
import type { BalanceSnapshotDto, GlobalSettingsDto, RpcStatusDto, WalletDto } from "@konda/shared";
import { api } from "../api";
import { AddWalletForm } from "./AddWalletForm";
import { BalanceHeader } from "./BalanceHeader";
import { SettingsPanel } from "./SettingsPanel";
import { WalletTable } from "./WalletTable";

export function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [wallets, setWallets] = useState<WalletDto[]>([]);
  const [balances, setBalances] = useState<BalanceSnapshotDto | null>(null);
  const [settings, setSettings] = useState<GlobalSettingsDto | null>(null);
  const [rpc, setRpc] = useState<RpcStatusDto | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /** Runs an action, shows its error in the banner. Resolves to true on success. */
  const handle = useCallback(
    async (fn: () => Promise<void>): Promise<boolean> => {
      setError(null);
      try {
        await fn();
        return true;
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 401) onLogout();
        else setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [onLogout],
  );

  // Initial load uses cached data only: no RPC call until "Frissítés".
  const loadLocal = useCallback(
    () =>
      handle(async () => {
        const [w, b, s, st] = await Promise.all([api.wallets(), api.balances(), api.settings(), api.status()]);
        setWallets(w);
        setBalances(b);
        setSettings(s);
        setRpc(st.rpc);
        setIssues(st.integrityIssues);
      }),
    [handle],
  );

  useEffect(() => {
    void loadLocal();
  }, [loadLocal]);

  const refresh = () =>
    handle(async () => {
      setRefreshing(true);
      try {
        setBalances(await api.refreshBalances());
      } finally {
        setRefreshing(false);
        setRpc((await api.status()).rpc);
      }
    });

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">Konda Manager</div>
        <div className="topbar-right">
          {settings?.dryRun && <span className="badge warn">DRY RUN</span>}
          {rpc && (
            <span
              className={`badge ${rpc.allFailed ? "bad" : rpc.active === "primary" ? "ok" : "warn"}`}
              title={rpc.lastError ?? ""}
            >
              RPC: {rpc.allFailed ? "nem elérhető" : rpc.active === "primary" ? "elsődleges" : "tartalék"}
            </span>
          )}
          <button
            className="ghost"
            onClick={() =>
              handle(async () => {
                await api.logout();
                onLogout();
              })
            }
          >
            Kilépés
          </button>
        </div>
      </header>

      {error && <div className="error banner">{error}</div>}
      {issues.length > 0 && (
        <div className="error banner">
          {issues.map((i) => (
            <div key={i}>{i}</div>
          ))}
        </div>
      )}

      <BalanceHeader snapshot={balances} refreshing={refreshing} onRefresh={refresh} />

      <section className="card">
        <h2>Walletek</h2>
        <WalletTable
          wallets={wallets}
          balances={balances}
          onUpdate={(id, patch) =>
            handle(async () => {
              const updated = await api.updateWallet(id, patch);
              setWallets((ws) => ws.map((w) => (w.id === id ? updated : w)));
            })
          }
          onDelete={(id) =>
            handle(async () => {
              await api.deleteWallet(id);
              await loadLocal();
            })
          }
        />
        <AddWalletForm
          hasMain={wallets.some((w) => w.role === "main")}
          onCreate={(req) =>
            handle(async () => {
              await api.createWallet(req);
              await loadLocal();
            })
          }
        />
      </section>

      {settings && (
        <SettingsPanel
          settings={settings}
          onSave={(patch) =>
            handle(async () => {
              setSettings(await api.updateSettings(patch));
            })
          }
        />
      )}
    </div>
  );
}
