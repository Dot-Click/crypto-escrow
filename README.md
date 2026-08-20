# Trade Haven

Context: I've attached 4 reference files — PROJECT_CONTEXT.md, ARCHITECTURE.md, REQUIREMENTS.md, COLOR_SCHEME.md. Read all of them before building anything. Follow the data model and escrow logic in ARCHITECTURE.md exactly — especially the wallet-level escrow model (escrow is an internal balance hold, not a new blockchain transaction per trade). Use COLOR_SCHEME.md for all UI. Build responsive for both desktop and mobile from Phase 1 onward — don't leave this for the end.

Build in phases. Confirm each phase is working before.

Phase 1 — Foundation: Auth, Profiles, Listing.

Supabase schema: User/Profile, Wallet, Listing, Trade, Message, Transaction, Dispute — exactly as defined in ARCHITECTURE.md

Auth: sign up / log in, profile with role (buyer/seller/both)

Seller can create a listing: crypto type, amount, price, accepted payment methods (multi-select)

Buyer can browse listings with search/filter (crypto type, payment method, price range) and basic sort

Fully responsive layout (mobile + desktop) using dark theme from COLOR_SCHEME.md

No wallet or crypto logic yet — data + UI shell only

Phase 2 — Wallet: Deposits & Withdrawals (NOWPayments, testnet)

Integrate NOWPayments API in sandbox/testnet mode

Each user gets a wallet per crypto type with a real external deposit address

Webhook /webhooks/nowpayments/deposit — verify signature, credit Wallet.balance, log a Transaction row

Withdrawal flow: user requests withdrawal to an external address → debit balance → call NOWPayments payout API → log Transaction

Wallet dashboard showing balance, deposit address/QR, deposit/withdrawal history

Phase 3 — Trade Rooms & Escrow Hold

Buyer commits to a listing → creates a Trade (trade room)

On trade creation, lock the trade amount from seller's wallet balance into escrow (internal ledger operation — no blockchain transaction, per ARCHITECTURE.md)

Trade status: pending → escrow_funded

Trade room UI shows: trade details, counterparty info, live status badge (colors from COLOR_SCHEME.md)

Phase 4 — Real-Time Trade Chat + Payment Confirmation

Real-time chat scoped to trade_id via Supabase Realtime

Chat unlocks once Trade.status = escrow_funded

Buyer can attach payment proof (image/text) in chat

Buyer: "I've Sent Payment" button → payment_claimed

Seller: "I've Received Payment" button → released → credits buyer's wallet balance, logs Transaction

"Raise Dispute" button available to either party any time before released → disputed status + Dispute record with reason

Phase 5 — Trade History + Admin Dashboard

Trade history page per user: past trades, status, counterparty, amount, date (backed by Transaction ledger)

Admin dashboard (separate protected route): view all users, wallets, trades, transactions

Admin can filter trades by status, especially disputed

Admin can manually resolve a dispute: release to buyer or return to seller

Seed demo data (a few test users, listings, and at least one full trade in each status) so the whole flow is demoable immediately

Constraints across all phases:

Testnet only — no real funds, no KYC, no automated dispute resolution

Never let client-side code write directly to Wallet.balance — all balance changes go through server-side functions with a Transaction log entry

Webhook signature verification required on both deposit and withdrawal callbacks

Rate-limit trade creation, chat messages, and withdrawal requests

Fully responsive on mobile — trade room and chat especially, since demo may happen on phone

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://trade-buddy-escrow.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8521d2fc-b2ac-4117-b124-2b74c26720f8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
