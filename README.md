# Konda Manager

Lokálisan futó dashboard több saját Solana wallet együttes kezelésére pump.fun / PumpSwap coinokhoz: 1 fő wallet, N követő wallet, copy-buy/copy-sell, pánikgomb, PnL.

> Állapot: **1. mérföldkő** – váz, titkosított keystore, belépés, wallet-kezelés, összesített SOL-egyenleg. A kereskedés a következő mérföldkövekben jön.

## Követelmények

- Node.js 20.10+ (ajánlott 22)
- pnpm 10 (`corepack enable` után automatikusan a megfelelő verzió)
- Helius (vagy más) RPC API-kulcs

## Első indítás

```bash
pnpm install
cp .env.example .env
pnpm hash-password          # a kiírt DASHBOARD_PASSWORD_HASH sort másold a .env-be
```

Töltsd ki a `.env`-ben:
- `RPC_PRIMARY_URL` / `RPC_PRIMARY_WS` – Helius URL az API-kulccsal
- `RPC_FALLBACK_URL` – tartalék RPC (ajánlott)
- `KEYSTORE_PASSWORD` – legalább 12 karakter; ezzel titkosítja a privát kulcsokat

## Indítás

| Mód | Parancs | VS Code |
|---|---|---|
| Fejlesztői (hot reload) | `pnpm dev` | **F5** („Konda Manager (dev)”) vagy **Ctrl+Shift+B** |
| Éles build | `pnpm start` | *Run Task → Konda Manager: start* |

Mindkét esetben: **http://localhost:8001**

Dev módban a Vite szolgálja ki a felületet a 8001-es porton, és a `/api` hívásokat a backendnek (8002) továbbítja. Éles módban a backend egyedül fut a 8001-en.

## Biztonság

- A szerver csak `127.0.0.1`-en hallgat, és jelszavas belépést kér (httpOnly, SameSite=Strict session cookie). Idegen `Host` vagy `Origin` fejlécű kéréseket elutasít (DNS-rebinding / CSRF védelem).
- A privát kulcsok csak a `data/keystore.enc` fájlban vannak, AES-256-GCM-mel titkosítva (scrypt kulcsszármaztatás a `KEYSTORE_PASSWORD`-ből). A böngészőbe soha nem kerülnek vissza, és a logokból ki vannak szűrve.
- `.env` és `data/` a `.gitignore`-ban van.
- **Mentés:** a `data/keystore.enc` fájlról és a `KEYSTORE_PASSWORD`-ről készíts biztonsági mentést. A dashboardon generált walletek kulcsa máshol nincs meg.
- Alapértelmezésben **dry run** mód van bekapcsolva.

## Credit-takarékosság

Nincs időzített lekérdezés. Az egyenlegek csak a **Frissítés** gombra (és később saját trade után) frissülnek, egyetlen `getMultipleAccounts` hívással (100 accountonként darabolva).

## Felépítés

```
apps/server   Node.js + Fastify backend (TypeScript)
  src/config     .env validáció
  src/rpc        elsődleges + tartalék RPC, failover
  src/keystore   titkosított kulcstár
  src/wallets    wallet service
  src/balances   egyenlegek (getMultipleAccounts)
  src/auth       jelszó, session
  src/api        REST API
  src/db         SQLite séma és repók
apps/web      React + Vite UI
packages/shared  közös típusok
```

## Parancsok

- `pnpm dev` – fejlesztői indítás
- `pnpm start` – build + éles indítás
- `pnpm test` – tesztek
- `pnpm typecheck` – típusellenőrzés
- `pnpm hash-password` – dashboard jelszó hash generálása
