import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type Db = Database.Database;

/**
 * Schema migrations, applied in order. Append new entries; never edit an
 * applied one. No secret material is stored in this database.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pubkey TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('main', 'follower')),
    enabled INTEGER NOT NULL DEFAULT 1,
    copy_buy_sol REAL NOT NULL DEFAULT 0.1,
    slippage_bps INTEGER,
    priority_fee_micro_lamports INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  -- At most one main wallet.
  CREATE UNIQUE INDEX wallets_single_main ON wallets(role) WHERE role = 'main';

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

export function openDatabase(filePath: string): Db {
  if (filePath !== ":memory:") mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]!);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
}
