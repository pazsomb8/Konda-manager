import type { UpdateWalletRequest, WalletDto, WalletRole } from "@konda/shared";
import type { Db } from "./database.js";

interface WalletRow {
  id: number;
  pubkey: string;
  label: string;
  role: WalletRole;
  enabled: number;
  copy_buy_sol: number;
  slippage_bps: number | null;
  priority_fee_micro_lamports: number | null;
  created_at: string;
}

function toDto(r: WalletRow): WalletDto {
  return {
    id: r.id,
    pubkey: r.pubkey,
    label: r.label,
    role: r.role,
    enabled: r.enabled === 1,
    copyBuySol: r.copy_buy_sol,
    slippageBps: r.slippage_bps,
    priorityFeeMicroLamports: r.priority_fee_micro_lamports,
    createdAt: r.created_at,
  };
}

export class WalletRepo {
  constructor(private readonly db: Db) {}

  list(): WalletDto[] {
    const rows = this.db
      .prepare("SELECT * FROM wallets ORDER BY CASE role WHEN 'main' THEN 0 ELSE 1 END, id")
      .all() as WalletRow[];
    return rows.map(toDto);
  }

  get(id: number): WalletDto | null {
    const row = this.db.prepare("SELECT * FROM wallets WHERE id = ?").get(id) as WalletRow | undefined;
    return row ? toDto(row) : null;
  }

  findByPubkey(pubkey: string): WalletDto | null {
    const row = this.db.prepare("SELECT * FROM wallets WHERE pubkey = ?").get(pubkey) as WalletRow | undefined;
    return row ? toDto(row) : null;
  }

  hasMain(): boolean {
    return this.db.prepare("SELECT 1 FROM wallets WHERE role = 'main'").get() !== undefined;
  }

  insert(input: { pubkey: string; label: string; role: WalletRole }): WalletDto {
    const info = this.db
      .prepare("INSERT INTO wallets (pubkey, label, role) VALUES (?, ?, ?)")
      .run(input.pubkey, input.label, input.role);
    return this.get(Number(info.lastInsertRowid))!;
  }

  update(id: number, patch: UpdateWalletRequest): WalletDto | null {
    const cols: string[] = [];
    const vals: unknown[] = [];
    if (patch.label !== undefined) (cols.push("label = ?"), vals.push(patch.label));
    if (patch.enabled !== undefined) (cols.push("enabled = ?"), vals.push(patch.enabled ? 1 : 0));
    if (patch.copyBuySol !== undefined) (cols.push("copy_buy_sol = ?"), vals.push(patch.copyBuySol));
    if (patch.slippageBps !== undefined) (cols.push("slippage_bps = ?"), vals.push(patch.slippageBps));
    if (patch.priorityFeeMicroLamports !== undefined)
      (cols.push("priority_fee_micro_lamports = ?"), vals.push(patch.priorityFeeMicroLamports));
    if (cols.length > 0) {
      this.db.prepare(`UPDATE wallets SET ${cols.join(", ")} WHERE id = ?`).run(...vals, id);
    }
    return this.get(id);
  }

  delete(id: number): void {
    this.db.prepare("DELETE FROM wallets WHERE id = ?").run(id);
  }
}
