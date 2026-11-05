import type { GlobalSettingsDto } from "@konda/shared";
import type { Db } from "./database.js";

export const DEFAULT_SETTINGS: GlobalSettingsDto = {
  slippageBps: 1500, // 15%: pump.fun coins move fast
  priorityFeeMicroLamports: 100_000,
  dryRun: true, // safe default until the user turns it off
};

export class SettingsRepo {
  constructor(private readonly db: Db) {}

  get(): GlobalSettingsDto {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value) as unknown]));
    return { ...DEFAULT_SETTINGS, ...stored } as GlobalSettingsDto;
  }

  update(patch: Partial<GlobalSettingsDto>): GlobalSettingsDto {
    const stmt = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    this.db.transaction(() => {
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined && k in DEFAULT_SETTINGS) stmt.run(k, JSON.stringify(v));
      }
    })();
    return this.get();
  }
}
