import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Uses Node's built-in SQLite (node:sqlite), so there is no native module to
 * compile on install. This matters on Windows, where prebuilt binaries for
 * new Node versions are often missing.
 */
export type Db = DatabaseSync;

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
  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

/** Run `fn` inside a transaction; rolls back if it throws. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function migrate(db: Db): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number } | undefined;
  const current = row?.user_version ?? 0;
  for (let i = current; i < MIGRATIONS.length; i++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[i]!);
      db.exec(`PRAGMA user_version = ${i + 1}`);
    });
  }
}
