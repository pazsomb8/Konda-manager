import { useEffect, useState } from "react";
import type { GlobalSettingsDto } from "@konda/shared";

interface Props {
  settings: GlobalSettingsDto;
  onSave: (patch: Partial<GlobalSettingsDto>) => void;
}

export function SettingsPanel({ settings, onSave }: Props) {
  const [slippage, setSlippage] = useState(String(settings.slippageBps));
  const [fee, setFee] = useState(String(settings.priorityFeeMicroLamports));

  useEffect(() => {
    setSlippage(String(settings.slippageBps));
    setFee(String(settings.priorityFeeMicroLamports));
  }, [settings]);

  const save = () => {
    const s = Math.round(Number(slippage));
    const f = Math.round(Number(fee));
    if (Number.isFinite(s) && Number.isFinite(f)) onSave({ slippageBps: s, priorityFeeMicroLamports: f });
  };

  return (
    <section className="card">
      <h2>Globális beállítások</h2>
      <div className="settings-grid">
        <label>
          Slippage (bps, 100 = 1%)
          <input inputMode="numeric" value={slippage} onChange={(e) => setSlippage(e.target.value)} />
        </label>
        <label>
          Priority fee (micro-lamport / CU)
          <input inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={settings.dryRun} onChange={(e) => onSave({ dryRun: e.target.checked })} />
          Dry run mód (nincs valódi küldés)
        </label>
      </div>
      <button className="primary" onClick={save}>
        Mentés
      </button>
    </section>
  );
}
