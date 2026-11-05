import { useState } from "react";
import type { BalanceSnapshotDto, UpdateWalletRequest, WalletDto } from "@konda/shared";
import { fmtSol, shortAddr, solscanAccount } from "../format";

interface Props {
  wallets: WalletDto[];
  balances: BalanceSnapshotDto | null;
  onUpdate: (id: number, patch: UpdateWalletRequest) => void;
  onDelete: (id: number) => void;
}

export function WalletTable({ wallets, balances, onUpdate, onDelete }: Props) {
  if (wallets.length === 0) return <p className="muted">Még nincs wallet. Adj hozzá egy fő walletet és a követőket.</p>;
  const solOf = (pubkey: string) => balances?.wallets.find((b) => b.pubkey === pubkey)?.sol;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Szerep</th>
            <th>Címke</th>
            <th>Cím</th>
            <th className="num">SOL</th>
            <th>Copy aktív</th>
            <th className="num">Copy-buy (SOL)</th>
            <th className="num">Slippage (bps)</th>
            <th className="num">Priority fee (µL/CU)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {wallets.map((w) => (
            <WalletRow key={w.id} wallet={w} sol={solOf(w.pubkey)} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
      <p className="muted small">Az üres slippage / priority fee mező a globális beállítást használja.</p>
    </div>
  );
}

function WalletRow({
  wallet: w,
  sol,
  onUpdate,
  onDelete,
}: {
  wallet: WalletDto;
  sol: number | undefined;
  onUpdate: Props["onUpdate"];
  onDelete: Props["onDelete"];
}) {
  const isFollower = w.role === "follower";
  return (
    <tr>
      <td>
        <span className={w.role === "main" ? "role main" : "role"}>{w.role === "main" ? "FŐ" : "Követő"}</span>
      </td>
      <td>
        <EditableText value={w.label} onSave={(label) => onUpdate(w.id, { label })} />
      </td>
      <td>
        <a href={solscanAccount(w.pubkey)} target="_blank" rel="noreferrer" title={w.pubkey}>
          {shortAddr(w.pubkey)}
        </a>{" "}
        <button className="ghost tiny" title="Másolás" onClick={() => void navigator.clipboard.writeText(w.pubkey)}>
          ⧉
        </button>
      </td>
      <td className="num">{sol === undefined ? "–" : fmtSol(sol)}</td>
      <td>
        {isFollower ? (
          <label className="switch">
            <input type="checkbox" checked={w.enabled} onChange={(e) => onUpdate(w.id, { enabled: e.target.checked })} />
            <span />
          </label>
        ) : (
          <span className="muted">–</span>
        )}
      </td>
      <td className="num">
        {isFollower ? (
          <NumberCell value={w.copyBuySol} step={0.01} onSave={(v) => v !== null && onUpdate(w.id, { copyBuySol: v })} />
        ) : (
          <span className="muted">–</span>
        )}
      </td>
      <td className="num">
        <NumberCell value={w.slippageBps} step={50} nullable onSave={(v) => onUpdate(w.id, { slippageBps: v === null ? null : Math.round(v) })} />
      </td>
      <td className="num">
        <NumberCell
          value={w.priorityFeeMicroLamports}
          step={10000}
          nullable
          onSave={(v) => onUpdate(w.id, { priorityFeeMicroLamports: v === null ? null : Math.round(v) })}
        />
      </td>
      <td>
        <button
          className="danger tiny"
          onClick={() => {
            if (
              window.confirm(
                `Biztosan törlöd a(z) "${w.label}" walletet?\n\nA privát kulcs is törlődik a keystore-ból. Ha nincs máshol mentésed róla, a walletben lévő pénzhez nem fogsz hozzáférni!`,
              )
            )
              onDelete(w.id);
          }}
        >
          Törlés
        </button>
      </td>
    </tr>
  );
}

function EditableText({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      className="inline"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() && draft !== value && onSave(draft.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function NumberCell({
  value,
  step,
  nullable,
  onSave,
}: {
  value: number | null;
  step: number;
  nullable?: boolean;
  onSave: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const commit = () => {
    const trimmed = draft.trim().replace(",", ".");
    if (trimmed === "") {
      if (nullable && value !== null) onSave(null);
      else if (!nullable) setDraft(String(value ?? ""));
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return setDraft(value === null ? "" : String(value));
    if (n !== value) onSave(n);
  };
  return (
    <input
      className="inline num"
      inputMode="decimal"
      step={step}
      placeholder={nullable ? "globális" : ""}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
