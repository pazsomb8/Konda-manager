import { useState, type FormEvent } from "react";
import type { CreateWalletRequest, WalletRole } from "@konda/shared";

interface Props {
  hasMain: boolean;
  /** Resolves to true when the wallet was created. */
  onCreate: (req: CreateWalletRequest) => Promise<boolean>;
}

/**
 * The secret key is sent once to the local backend, which encrypts it into
 * the keystore. It is never sent back to the browser.
 */
export function AddWalletForm({ hasMain, onCreate }: Props) {
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<WalletRole>(hasMain ? "follower" : "main");
  const [mode, setMode] = useState<"import" | "generate">("import");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);

  const effectiveRole: WalletRole = hasMain ? "follower" : role;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const ok = await onCreate({
        label: label.trim(),
        role: effectiveRole,
        secretKey: mode === "import" ? secret.trim() : undefined,
      });
      if (ok) {
        setLabel("");
        setSecret("");
      }
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = label.trim() !== "" && (mode === "generate" || secret.trim() !== "");

  return (
    <form className="add-wallet" onSubmit={submit} autoComplete="off">
      <h3>Wallet hozzáadása</h3>
      <div className="row">
        <input placeholder="Címke (pl. Követő 1)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <select value={effectiveRole} disabled={hasMain} onChange={(e) => setRole(e.target.value as WalletRole)}>
          <option value="main">Fő wallet</option>
          <option value="follower">Követő</option>
        </select>
        <select value={mode} onChange={(e) => setMode(e.target.value as "import" | "generate")}>
          <option value="import">Meglévő importálása</option>
          <option value="generate">Új generálása</option>
        </select>
      </div>
      {mode === "import" && (
        <input
          type="password"
          className="secret"
          placeholder="Privát kulcs (base58 vagy [1,2,3,...] JSON tömb)"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          spellCheck={false}
        />
      )}
      {mode === "generate" && (
        <p className="muted small">
          Új kulcspár készül, ami csak a titkosított keystore-ba kerül (data/keystore.enc). A keystore fájlról és a
          KEYSTORE_PASSWORD-ről készíts mentést, mert a kulcs máshol nem lesz meg.
        </p>
      )}
      <button type="submit" className="primary" disabled={!canSubmit || busy}>
        {busy ? "Mentés…" : "Hozzáadás"}
      </button>
    </form>
  );
}
