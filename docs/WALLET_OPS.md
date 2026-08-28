# Wallet operations — mainnet HD deposit addresses

**This document must be read end-to-end before anyone touches the mainnet
wallet system.** Mistakes with the mnemonic, master key, or collector
addresses lose real user funds and are unrecoverable.

**Before doing any of this on mainnet, run the full flow on testnet first
— see [TESTNET_PLAYBOOK.md](./TESTNET_PLAYBOOK.md). The same seed
generator + code paths cover both; only the collector addresses, the
env var `NETWORK_ENV`, and the `active` flags on `master_wallets` differ.
Testnet is free and worthless; mainnet is not.**

## Custody model (read this first)

Every user's deposit address is derived from a single 24-word BIP-39
mnemonic. That mnemonic, encrypted with a master key, lives in a
Supabase project secret. The Supabase Edge Functions decrypt it in
memory to derive addresses and sign transactions.

**Threat model — plainly:**

- Anyone with read access to the Supabase project's secrets can drain
  every user balance. This includes Supabase employees with prod DB
  access, anyone who compromises the Supabase account, and anyone who
  compromises a developer laptop with an authenticated `supabase` CLI.
- Anyone with the paper mnemonic backup can drain everything, forever,
  regardless of what happens to Supabase.
- **There is no third-party custody**, no insurance, no MPC quorum,
  and no key rotation without moving every user's funds to new
  addresses.

This is the accepted trade-off in exchange for zero custody cost. If the
project ever holds more than the operators can afford to lose, migrate
to a custody provider (Fireblocks, BitGo) or a KMS-signed model before
that threshold is reached.

## One-time seed generation

Run this once, on an offline machine, and never again:

1. Clone the repo onto a laptop with Wi-Fi off.
2. `npm install --no-save bip39 bip32 tiny-secp256k1 bitcoinjs-lib ethers`
3. `node scripts/generate-wallet-seed.mjs`
4. Copy the four things it prints:
   - The mnemonic — write on paper, do NOT save digitally.
   - `WALLET_MASTER_KEY` — base64.
   - `WALLET_ENCRYPTED_SEED` — base64.
   - Four collector addresses (BTC / LTC / ETH / BSC).
5. Clear the terminal (`clear` and close it).
6. Seal the mnemonic in an envelope, store in a safe. Multiple copies
   at multiple locations is fine — every copy is a full compromise
   vector.

## Setting Supabase secrets

Once the seed is generated:

```bash
supabase secrets set \
  WALLET_MASTER_KEY='<from generator>' \
  WALLET_ENCRYPTED_SEED='<from generator>' \
  CRON_SECRET='<generate with: openssl rand -hex 32>'
```

Optional overrides for RPC endpoints (defaults are free public nodes):

```bash
supabase secrets set \
  ETH_RPC_URL='https://ethereum-rpc.publicnode.com' \
  BSC_RPC_URL='https://bsc-dataseed.binance.org' \
  BTC_ESPLORA_URL='https://blockstream.info/api' \
  LTC_ESPLORA_URL='https://litecoinspace.org/api'
```

## Setting the collector addresses

Open `supabase/migrations/20260828_seed_mainnet_collectors.sql`. Replace
the four `PLACEHOLDER_SET_COLLECTOR_ADDRESS_BEFORE_DEPLOY` strings with
the collector addresses from the generator output. Then flip `active`
from `false` to `true` on the networks you're actually going live with.

**Do not enable a network until you have (a) set the collector address
and (b) test-deposited a tiny amount and confirmed the watcher credited
it and the sweeper moved it to the collector.**

## Deploying the edge functions

```bash
supabase functions deploy watch-deposits
supabase functions deploy sweep
supabase functions deploy derive-address
supabase functions deploy broadcast-withdrawals
```

## Optional safety-belt secrets

These have safe defaults but are worth setting explicitly on mainnet:

```bash
supabase secrets set \
  MAX_SWEEPS_PER_TICK=10 \
  MAX_FEE_RATIO=0.05 \
  MAX_EVM_GWEI=150 \
  MIN_CONFIRMATIONS_BEFORE_SWEEP=6 \
  BTC_SAT_PER_VB=10 \
  LTC_SAT_PER_VB=2
```

Bump `MAX_EVM_GWEI` if you legitimately want sweeps and withdrawals to
go through during expensive gas periods.

## Wiring the cron schedule

The `20260828_wire_deposit_crons.sql` migration schedules both functions.
Before running it:

1. Enable extensions in Supabase dashboard: `pg_cron`, `pg_net`.
2. In the SQL editor, register the two Vault secrets the migration reads:

   ```sql
   SELECT vault.create_secret(
     'https://<project-ref>.supabase.co/functions/v1',
     'edge_functions_base_url'
   );
   SELECT vault.create_secret(
     '<your CRON_SECRET>',
     'cron_secret'
   );
   ```

Then run the migration.

## Environment on the Vercel side

The Vercel deployment needs to reach the `derive-address` Edge Function:

- `SUPABASE_FUNCTIONS_URL` — e.g. `https://<project-ref>.supabase.co/functions/v1`
- `CRON_SECRET` — same value set as a Supabase secret

Set both in Vercel project settings, **Production scope only**. Do not
share these env vars with Preview or with team members who don't need
prod access.

## Health checks

Every 15 minutes, look at:

- `deposit_claims` where `status = 'pending'` and `created_at < now() - interval '2 hours'`
  → the watcher isn't crediting them; investigate.
- `deposit_sweeps` where `status IN ('pending', 'failed')` and `created_at < now() - interval '1 hour'`
  → sweeper stuck; check `error_message`.
- `withdrawals` where `status = 'pending'` and `created_at < now() - interval '30 minutes'`
  → withdrawal broadcaster stuck; check `error_message`.
- `withdrawals` where `status = 'broadcast'` and `updated_at < now() - interval '2 hours'`
  → tx broadcast but never confirmed; may need manual RBF/rebroadcast.
- Collector address balances (query via the RPCs directly) matching the
  sum of `deposit_sweeps.amount` on `status = 'broadcast' OR 'confirmed'`
  MINUS the sum of `withdrawals.amount + withdrawals.fee` on those same
  statuses. Any drift means funds were moved out-of-band.

## Recovery procedures

### Mnemonic lost

**All funds are unrecoverable.** There is no other backup. The paper
copy IS the backup. This is the whole reason the paper copy exists.

### Master key leaked (mnemonic paper safe)

Every current derivation is at risk. Steps:

1. Move all funds out of every user address AND the collectors, into
   fresh externally-generated wallets.
2. Generate a new seed via the offline script (new mnemonic, new master
   key, new encrypted seed).
3. Rotate the Supabase secrets.
4. Re-derive every user's address at their existing derivation_index
   with the NEW seed — this produces a NEW address per user.
5. Update `user_deposit_addresses.address` for every row. Users must
   receive an in-app notification: their deposit address changed.

### Master key leaked AND paper mnemonic leaked

Assume every future deposit will be stolen. Halt deposits immediately
(`UPDATE master_wallets SET active = false;`), notify users, and follow
the "master key leaked" flow. Any funds still on user addresses when
the leak happened are gone.

## Minimum deposit amounts

Sweeping dust costs more than it recovers. Enforce these client-side
minimums in the deposit UI (currently informational; make them hard
limits before mainnet launch):

| Network      | Minimum |
|--------------|---------|
| BTC_MAINNET  | 0.0005 BTC (~$25 at $50k) |
| LTC_MAINNET  | 0.05 LTC  |
| ETH_MAINNET  | 0.01 ETH  |
| BSC_MAINNET  | 5 USDT    |

Deposits below these levels will still be detected but may sit on the
user address until they're combined with a future deposit.

## Untested surfaces

The following code was written but has NOT been tested against mainnet:

- Sweeper fee estimation (BTC and LTC). Uses a flat sat/vB; check
  mempool conditions before enabling.
- BSC USDT gas top-up flow. The collector must be pre-funded with BNB
  for this to work at all.
- ETH sweep against high-fee blocks. If gas price exceeds the sweep
  amount, the sweep will silently skip.

Run each on testnet-equivalent networks (or with tiny mainnet amounts)
before turning on user traffic.
