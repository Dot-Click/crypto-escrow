// Server-only orchestrator: given a deposit claim, checks the real chain via
// block-explorers.server.ts and decides whether to credit it. The wallet
// balance and transactions ledger are only ever touched from here, and only
// off explorer-confirmed data — the user's claimed amount is never trusted.
import { fetchBscTx, fetchBtcTx, fetchEthTx, fetchLtcTx, fetchTronTx, type ExplorerCheckResult } from "@/lib/block-explorers.server";
import { isSignatureNetwork } from "@/lib/address-signature.server";
import type { Database, Json } from "@/integrations/supabase/types";

type DepositClaimRow = Database["public"]["Tables"]["deposit_claims"]["Row"];

/** How many rounds of "not found" before a claim is auto-rejected instead of staying pending forever. */
const MAX_NOT_FOUND_ATTEMPTS = 8;

/** Relative tolerance on the claimed vs. on-chain amount, to absorb gas/dust rounding. */
const AMOUNT_TOLERANCE_PERCENT = 0.5;

type MasterWallet = {
  id: string;
  address: string;
  token_contract_address: string | null;
  min_confirmations: number;
};

async function fetchOnChain(network: string, txHash: string, masterWallet: MasterWallet): Promise<ExplorerCheckResult> {
  const common = { txHash, masterAddress: masterWallet.address, tokenContract: masterWallet.token_contract_address };
  switch (network) {
    case "USDT_TRC20":
      return fetchTronTx(common);
    case "USDT_BEP20":
      return fetchBscTx(common);
    case "ETH_SEPOLIA":
      return fetchEthTx(common);
    case "BTC_TESTNET":
      return fetchBtcTx({ txHash, masterAddress: masterWallet.address });
    case "LTC_TESTNET":
      return fetchLtcTx({ txHash, masterAddress: masterWallet.address });
    default:
      return { found: false, confirmed: false, confirmations: 0, toAddress: null, fromAddress: null, amount: null, error: `Unsupported network: ${network}` };
  }
}

function withinTolerance(claimed: number, actual: number): boolean {
  if (actual === 0) return claimed === 0;
  const diffPercent = (Math.abs(claimed - actual) / actual) * 100;
  return diffPercent <= AMOUNT_TOLERANCE_PERCENT;
}

export async function runVerificationAndMaybeCredit(claimId: string): Promise<DepositClaimRow> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  async function refetchClaim(): Promise<DepositClaimRow> {
    const { data, error } = await supabaseAdmin.from("deposit_claims").select("*").eq("id", claimId).single();
    if (error) throw new Error(error.message);
    return data;
  }

  const claim = await refetchClaim();
  if (claim.status !== "pending") return claim;

  const { data: masterWallet, error: mwErr } = await supabaseAdmin
    .from("master_wallets")
    .select("id, address, token_contract_address, min_confirmations")
    .eq("id", claim.master_wallet_id)
    .maybeSingle<MasterWallet>();
  if (mwErr) throw new Error(mwErr.message);
  if (!masterWallet) throw new Error("Master wallet not found for this claim");

  async function log(result: string, details: Record<string, unknown>) {
    await supabaseAdmin.from("deposit_verification_log").insert({ deposit_claim_id: claimId, result, details: details as Json });
  }

  async function reject(reason: string, result: string, raw?: unknown): Promise<DepositClaimRow> {
    await log(result, { reason, raw });
    await supabaseAdmin
      .from("deposit_claims")
      .update({ status: "rejected", rejection_reason: reason, last_checked_at: new Date().toISOString() })
      .eq("id", claimId)
      .eq("status", "pending");
    return refetchClaim();
  }

  const check = await fetchOnChain(claim.network, claim.tx_hash, masterWallet);

  if (check.error) {
    await log("error", { message: check.error });
    await supabaseAdmin
      .from("deposit_claims")
      .update({ attempt_count: claim.attempt_count + 1, last_checked_at: new Date().toISOString() })
      .eq("id", claimId);
    return refetchClaim();
  }

  if (!check.found) {
    const nextAttempt = claim.attempt_count + 1;
    await log("not_found", { attempt: nextAttempt });
    if (nextAttempt >= MAX_NOT_FOUND_ATTEMPTS) {
      return reject("Transaction not found after multiple checks. Verify the TxID and network, then submit a new claim.", "not_found");
    }
    await supabaseAdmin
      .from("deposit_claims")
      .update({ attempt_count: nextAttempt, last_checked_at: new Date().toISOString() })
      .eq("id", claimId);
    return refetchClaim();
  }

  if (!check.toAddress || check.toAddress.toLowerCase() !== masterWallet.address.toLowerCase()) {
    return reject("This transaction does not send funds to our deposit wallet.", "address_mismatch", check.raw);
  }

  if (check.amount === null || !withinTolerance(claim.claimed_amount, check.amount)) {
    return reject(
      `The amount on-chain (${check.amount ?? "unknown"}) does not match the claimed amount (${claim.claimed_amount}).`,
      "amount_mismatch",
      check.raw,
    );
  }

  // Anti-race-condition guard: the master wallet address is public, so
  // anyone can spot a real deposit on an explorer and try to claim it before
  // the actual depositor does. We can't verify who submitted first, but we
  // can verify whose wallet the funds actually came FROM.
  //
  // For networks with a signature verifier wired up (see
  // address-signature.server.ts), a first-time sender must have already
  // proven ownership of that address via deposit-address.functions.ts
  // *before* we'll credit anything sent from it — otherwise this whole guard
  // is a no-op on exactly the claim it's meant to stop (a stranger's very
  // first claim from an address nobody has registered yet). Other networks
  // (currently just USDT_TRC20) fall back to binding-on-first-deposit, which
  // only protects repeat deposits, not that first one.
  const requiresSignature = isSignatureNetwork(claim.network);
  const fromAddress = check.fromAddress?.toLowerCase() ?? null;

  if (!fromAddress) {
    if (requiresSignature) {
      return reject(
        "Couldn't determine the sending address for this transaction, so it can't be verified automatically. Contact support.",
        "sender_address_undeterminable",
        check.raw,
      );
    }
  } else {
    const { data: binding, error: bindingErr } = await supabaseAdmin
      .from("deposit_source_addresses")
      .select("user_id")
      .eq("network", claim.network)
      .eq("address", fromAddress)
      .maybeSingle();
    if (bindingErr) throw new Error(bindingErr.message);

    if (binding && binding.user_id !== claim.user_id) {
      return reject(
        "This deposit's sending address is already registered to another account.",
        "sender_address_mismatch",
        { fromAddress },
      );
    }

    if (!binding && requiresSignature) {
      return reject(
        "This sending address hasn't been verified on your account yet. Go to Wallet -> Deposit -> Verify sending address, sign the message with the wallet you sent from, then submit this claim again.",
        "sender_address_unverified",
        { fromAddress },
      );
    }
  }

  if (!check.confirmed || check.confirmations < masterWallet.min_confirmations) {
    await log("found_pending", { confirmations: check.confirmations, required: masterWallet.min_confirmations });
    await supabaseAdmin
      .from("deposit_claims")
      .update({
        attempt_count: claim.attempt_count + 1,
        confirmations: check.confirmations,
        last_checked_at: new Date().toISOString(),
      })
      .eq("id", claimId);
    return refetchClaim();
  }

  // Confirmed, correct address, amount within tolerance — credit it.
  // The used_tx_hashes insert is the atomic replay guard: if another claim
  // (this one on retry, or a concurrent request) already used this TxID on
  // this network, the unique constraint rejects the insert and we bail
  // without touching the wallet balance.
  const { error: usedErr } = await supabaseAdmin
    .from("used_tx_hashes")
    .insert({ network: claim.network, tx_hash: claim.tx_hash, deposit_claim_id: claimId });
  if (usedErr) {
    return reject("This transaction ID has already been used for a deposit.", "already_used", { code: usedErr.code });
  }

  if (fromAddress && !requiresSignature) {
    // Fallback binding for networks with no signature verifier: the first
    // successful deposit from this address binds it to this user. A
    // unique-violation here just means it's already bound (to this same
    // user, from an earlier deposit) — harmless, not an error. Networks that
    // require a signature never reach this: they're only credited once
    // deposit-address.functions.ts has already created the binding.
    const { error: bindInsertErr } = await supabaseAdmin
      .from("deposit_source_addresses")
      .insert({
        crypto_type: claim.crypto_type,
        network: claim.network,
        address: fromAddress,
        user_id: claim.user_id,
        verification_method: "first_deposit",
        first_deposit_claim_id: claimId,
      });
    if (bindInsertErr && bindInsertErr.code !== "23505") {
      console.error("[deposit-verification] failed to record source-address binding", bindInsertErr);
    }
  }

  const { data: wallet, error: walletErr } = await supabaseAdmin
    .from("wallets")
    .select("id, balance")
    .eq("id", claim.wallet_id)
    .single();
  if (walletErr) throw new Error(walletErr.message);

  const amount = check.amount;

  const { data: tx, error: txErr } = await supabaseAdmin
    .from("transactions")
    .insert({
      wallet_id: claim.wallet_id,
      user_id: claim.user_id,
      type: "deposit",
      amount,
      crypto_type: claim.crypto_type,
      external_tx_hash: claim.tx_hash,
      external_address: masterWallet.address,
      status: "completed",
    })
    .select("id")
    .single();
  if (txErr) throw new Error(txErr.message);

  await supabaseAdmin
    .from("wallets")
    .update({ balance: Number(wallet.balance) + amount })
    .eq("id", wallet.id);

  await log("found_confirmed", { amount, confirmations: check.confirmations });

  await supabaseAdmin
    .from("deposit_claims")
    .update({
      status: "verified",
      verified_amount: amount,
      confirmations: check.confirmations,
      transaction_id: tx.id,
      last_checked_at: new Date().toISOString(),
    })
    .eq("id", claimId);

  return refetchClaim();
}
