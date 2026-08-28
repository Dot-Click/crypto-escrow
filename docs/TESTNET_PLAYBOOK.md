# Testnet playbook

**Run this end-to-end before turning mainnet on for real users.** Testnet
coins are free and worthless, so mistakes cost nothing but time. Every
mistake caught here is one that isn't caught with real customer funds.

## Design

The same encrypted seed derives BOTH testnet and mainnet addresses,
using different BIP-44 coin types. Both sets of collector rows coexist
in `master_wallets`; nothing is enabled until you flip `active=true` on
the rows you want live. That means you can:

- Run purely on testnet (only testnet rows active, `NETWORK_ENV=testnet`).
- Run purely on mainnet (only mainnet rows active, `NETWORK_ENV=mainnet`,
  which is the default).
- Cut over from testnet to mainnet by activating the mainnet rows and
  changing one env var — no code redeploy, no migration.

Users only ever see the addresses for the active env because
`getMyDepositAddresses` filters `master_wallets` through the active
allowlist.

## Step 1 — Generate the seed (once, offline)

Same as the mainnet flow — see [WALLET_OPS.md](./WALLET_OPS.md). The
generator now prints BOTH mainnet and testnet collector addresses from
a single mnemonic. Copy the testnet ones into
`supabase/migrations/20260828_seed_testnet_hd_networks.sql` (the four
`PLACEHOLDER_SET_TESTNET_COLLECTOR_BEFORE_DEPLOY` strings) and keep the
mainnet ones for later.

## Step 2 — Set env + deploy

```bash
supabase secrets set \
  WALLET_ENCRYPTED_SEED='...' \
  WALLET_MASTER_KEY='...' \
  CRON_SECRET='...' \
  NETWORK_ENV=testnet
```

On Vercel, set `NETWORK_ENV=testnet` in Production. Preview envs
inherit unless you explicitly set them to `mainnet`.

Deploy the Edge Functions, run migrations, wire cron — same as the
mainnet flow.

## Step 3 — Activate the testnet networks

In the Supabase SQL editor:

```sql
UPDATE public.master_wallets
   SET active = true
 WHERE network IN ('BTC_TESTNET', 'LTC_TESTNET', 'ETH_SEPOLIA', 'BSC_TESTNET');
```

Confirm each row has a real collector address (not `PLACEHOLDER_...`)
before activating — the sweeper refuses to run against placeholders,
but the watcher will still allocate user addresses.

## Step 4 — Fund the collectors

Testnet requires some faucet activity to give the collectors enough
native coin to pay gas / dust on withdrawal broadcasts.

| Network       | Faucet |
|---------------|--------|
| BTC_TESTNET   | https://coinfaucet.eu/en/btc-testnet/ |
| LTC_TESTNET   | https://testnet-faucet.com/ltc-testnet/ |
| ETH_SEPOLIA   | https://sepoliafaucet.com/ or https://cloud.google.com/application/web3/faucet/ethereum/sepolia |
| BSC_TESTNET   | https://testnet.bnbchain.org/faucet-smart (BNB, for gas) |
| tUSDT on BSC  | https://testnet.bnbchain.org/faucet-smart (select "BEP20 USDT") — sent to the BSC_TESTNET collector |

Rough amounts to request:

- Sepolia: 0.5 SepETH (enough for many test withdrawals)
- BSC testnet: 1 tBNB + 100 tUSDT
- BTC/LTC testnet: a few "test coins" each

## Step 5 — End-to-end deposit → sweep → withdraw

For EACH network you activate:

### Deposit test

1. Sign into the app as a test user.
2. Open the deposit dialog for the coin (e.g. BTC).
3. Copy the derived address. Confirm it starts with the expected
   testnet prefix (`tb1…` for BTC, `tltc1…` for LTC, `0x…` for EVM).
4. Send a small amount from a testnet wallet or faucet.
5. Wait for the watcher tick (up to 1 minute).
6. Check `deposit_claims` — should have a `pending` row with the
   correct amount and txid.
7. Wait for confirmations (1 conf on BTC/LTC testnet, 3 on EVM
   testnets — see `master_wallets.min_confirmations`).
8. Refresh the wallet page — balance should increment. `deposit_claims`
   row should be `verified`.

### Sweep test

1. Wait for the sweep cron tick (every 15 minutes).
2. Check `deposit_sweeps` — should have a `broadcast` row for the
   deposit's user address, moving funds to the collector.
3. For BSC USDT: expect TWO rows — first a `gas_topup` row (BNB from
   collector to user address), then the actual USDT sweep on the
   next tick after the top-up confirms.
4. Watch the txid on the corresponding testnet block explorer:
   - Bitcoin/Litecoin testnet: mempool.space testnet mode
   - Sepolia: sepolia.etherscan.io
   - BSC testnet: testnet.bscscan.com

### Withdrawal test

1. From the app, submit a withdrawal to any testnet-format address you
   control (e.g. another wallet you own).
2. Check `withdrawals` — should insert a `pending` row and the user's
   balance should already be debited.
3. Wait for the broadcaster tick (every 5 minutes).
4. Row moves to `broadcast`, `tx_hash` populated.
5. Wait for confirmations. Row moves to `confirmed`.
6. Verify funds arrived at your destination address on the block
   explorer.

### Failure paths to exercise

- **Invalid destination address**: submit a mainnet address on
  testnet — server should refuse.
- **Below minimum**: submit less than `WITHDRAWAL_MIN_TESTNET[coin]`
  — server should refuse.
- **Insufficient collector balance**: temporarily drain the collector
  (send its balance to a faucet return address); submit a withdrawal
  larger than what's left. Row should stay `pending` with
  `error_message = "collector short of …"` and `attempt_count` growing.
  After 3 attempts it should refund the user's balance.
- **Sweep dust**: send an amount below the sweep min. Watcher should
  credit it; sweeper should leave it on the user address.

## Step 6 — Graduation checklist

Before setting `NETWORK_ENV=mainnet` and activating the mainnet rows:

- [ ] All four testnet networks completed deposit → sweep → withdraw
      at least once each.
- [ ] BSC USDT gas top-up + sweep completed at least once.
- [ ] A withdrawal was successfully refunded after collector-short
      failures.
- [ ] `deposit_claims` accurately reflected the on-chain amount to the
      user (no drift in either direction).
- [ ] The paper mnemonic backup was verified: run the offline generator
      in "verify" mode (by re-deriving the same collector address from
      the mnemonic on paper — if any character was wrote down wrong,
      the derived address will not match. **Do this before any
      real money touches the system.**)
- [ ] Emergency shutoff tested: run
      `UPDATE master_wallets SET active = false;` and confirm the
      watcher/sweeper/broadcaster all report "not active" within one
      tick.

Once the checklist is complete:

```sql
UPDATE public.master_wallets
   SET active = true
 WHERE network IN ('BTC_MAINNET', 'LTC_MAINNET', 'ETH_MAINNET', 'BSC_MAINNET');

-- Optionally leave the testnet rows active so QA can keep testing.
-- Otherwise, deactivate them so the watcher doesn't hit testnet RPCs
-- unnecessarily:
UPDATE public.master_wallets
   SET active = false
 WHERE network IN ('BTC_TESTNET', 'LTC_TESTNET', 'ETH_SEPOLIA', 'BSC_TESTNET');
```

Change `NETWORK_ENV` from `testnet` to `mainnet` on Vercel and Supabase
secrets. Redeploy the frontend. Users now see mainnet addresses.

## Known-not-tested cases

Because I cannot run the code against live networks in this environment,
the following code paths have never actually been exercised:

- BTC and LTC testnet Esplora URLs (endpoint may differ from what's
  hardcoded — check `blockstream.info/testnet/api` still exists at time
  of setup, and swap in `mempool.space/testnet/api` if it doesn't).
- Litecoin testnet4 bech32 config bytes — verify a derived address
  actually validates on a Litecoin testnet explorer before depending
  on it.
- BSC testnet USDT contract address — testnet tokens get re-deployed;
  confirm the address in the seed migration matches whatever BSC's
  own faucet currently sends.

If any of the above fails, that's the surface to look at first before
concluding the wallet code has a bug.
