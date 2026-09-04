// Server-only escrow engine. Escrow is an internal ledger hold on the seller's
// wallet balance (balance -> held_balance), never a new blockchain transaction.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enforceRateLimit } from "@/lib/rate-limit.server";
import { getMarketPrice } from "@/lib/market-price.server";
import { getFxRate } from "@/lib/fx-rate.server";
import { computeEffectivePrice, computeReceiveAmount } from "@/lib/pricing";
import { PLATFORM_FEE_PERCENT } from "@/lib/constants";

type TradeRow = {
  id: string;
  buyer_id: string;
  seller_id: string;
  crypto_type: string;
  amount: number;
  payout_amount: number;
  status: string;
  updated_at: string;
};

async function loadTrade(tradeId: string, userId: string): Promise<TradeRow> {
  await expireStaleTrades({ tradeId });

  const { data, error } = await supabaseAdmin
    .from("trades")
    .select("id, buyer_id, seller_id, crypto_type, amount, payout_amount, status, updated_at")
    .eq("id", tradeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Trade not found");
  if (data.buyer_id !== userId && data.seller_id !== userId) {
    throw new Error("You are not a party to this trade");
  }
  return { ...data, amount: Number(data.amount), payout_amount: Number(data.payout_amount) };
}

const BUYER_DISPUTE_WAIT_MS = 30 * 60 * 1000;

async function ensureWallet(userId: string, cryptoType: string) {
  const { data } = await supabaseAdmin
    .from("wallets")
    .select("id, balance, held_balance")
    .eq("user_id", userId)
    .eq("crypto_type", cryptoType)
    .maybeSingle();
  if (data) return { ...data, balance: Number(data.balance), held_balance: Number(data.held_balance) };

  const { data: created, error } = await supabaseAdmin
    .from("wallets")
    .insert({ user_id: userId, crypto_type: cryptoType })
    .select("id, balance, held_balance")
    .single();
  if (error) throw new Error(error.message);
  return { ...created, balance: Number(created.balance), held_balance: Number(created.held_balance) };
}

async function refundEscrow(trade: { id: string; seller_id: string; crypto_type: string; amount: number }) {
  const sellerWallet = await ensureWallet(trade.seller_id, trade.crypto_type);
  await supabaseAdmin
    .from("wallets")
    .update({
      balance: sellerWallet.balance + trade.amount,
      held_balance: Math.max(0, sellerWallet.held_balance - trade.amount),
    })
    .eq("id", sellerWallet.id);

  await supabaseAdmin.from("transactions").insert({
    wallet_id: sellerWallet.id,
    user_id: trade.seller_id,
    trade_id: trade.id,
    type: "escrow_refund",
    amount: trade.amount,
    crypto_type: trade.crypto_type,
    status: "completed",
  });
}

/**
 * Cancels and refunds any trade still waiting on the buyer past its payment
 * window, so escrow never stays locked forever just because nobody acted on
 * it. Called lazily whenever a trade is read or acted on — no cron needed for
 * correctness, though one can be added as a belt-and-suspenders sweep.
 */
export async function expireStaleTrades(params?: { tradeId?: string; userId?: string }) {
  let query = supabaseAdmin
    .from("trades")
    .select("id, seller_id, crypto_type, amount")
    .eq("status", "escrow_funded")
    .lt("expires_at", new Date().toISOString());

  if (params?.tradeId) query = query.eq("id", params.tradeId);
  if (params?.userId) query = query.or(`buyer_id.eq.${params.userId},seller_id.eq.${params.userId}`);

  const { data: expired, error } = await query;
  if (error) throw new Error(error.message);
  if (!expired || expired.length === 0) return { expiredCount: 0 };

  for (const trade of expired) {
    // Claim the transition first so a concurrent action on the same trade can't double-refund.
    const { data: claimed } = await supabaseAdmin
      .from("trades")
      .update({ status: "cancelled" })
      .eq("id", trade.id)
      .eq("status", "escrow_funded")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    await refundEscrow({ ...trade, amount: Number(trade.amount) });

    const { notifyTradeEnded } = await import("@/lib/trade-notify.server");
    await notifyTradeEnded({ tradeId: trade.id, outcome: "cancelled" });
  }

  return { expiredCount: expired.length };
}

async function bumpTradesCompleted(userIds: string[]) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, trades_completed")
    .in("id", userIds);
  await Promise.all(
    (data ?? []).map((p) =>
      supabaseAdmin
        .from("profiles")
        .update({ trades_completed: p.trades_completed + 1 })
        .eq("id", p.id),
    ),
  );
}

export async function openTrade(params: {
  listingId: string;
  fiatAmount: number;
  paymentMethod: string;
  userId: string;
}) {
  await enforceRateLimit({
    userId: params.userId,
    action: "trade_create",
    limit: 10,
    windowSeconds: 3600,
  });

  const { data: listing, error } = await supabaseAdmin
    .from("listings")
    .select(
      "id, seller_id, side, crypto_type, margin_percent, fixed_price, min_amount, max_amount, payment_window_minutes, fiat_currency, accepted_payment_methods, status",
    )
    .eq("id", params.listingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!listing || listing.status !== "active") throw new Error("This offer is no longer available");
  if (listing.seller_id === params.userId) throw new Error("You cannot trade with your own offer");
  if (!listing.accepted_payment_methods.includes(params.paymentMethod)) {
    throw new Error("That payment method is not accepted on this offer");
  }
  if (listing.min_amount != null && params.fiatAmount < Number(listing.min_amount)) {
    throw new Error(`This offer requires at least $${listing.min_amount}`);
  }
  if (listing.max_amount != null && params.fiatAmount > Number(listing.max_amount)) {
    throw new Error(`This offer covers at most $${listing.max_amount}`);
  }

  // Price and fee are computed and locked in now — later market or fee changes
  // must never affect an already-open trade. Fixed-rate listings skip the
  // live feed entirely (their price is already in the listing's currency);
  // margin listings need a fresh market price converted into that currency.
  const effectivePrice =
    listing.fixed_price != null
      ? Number(listing.fixed_price)
      : computeEffectivePrice(
          await getMarketPrice(listing.crypto_type),
          Number(listing.margin_percent),
          await getFxRate(listing.fiat_currency),
        );
  const { grossCrypto, feeCrypto, netCrypto } = computeReceiveAmount(
    params.fiatAmount,
    effectivePrice,
    PLATFORM_FEE_PERCENT,
  );
  // No listing-level inventory cap: how much a seller can actually cover is
  // enforced below by their live wallet balance, same as SafeTheTrade — the
  // fiat min/max range above is the only ceiling declared on the offer.

  // On a "sell" offer the lister sells crypto; on a "buy" offer the visitor sells.
  const sellerId = listing.side === "sell" ? listing.seller_id : params.userId;
  const buyerId = listing.side === "sell" ? params.userId : listing.seller_id;

  const wallet = await ensureWallet(sellerId, listing.crypto_type);
  if (wallet.balance < grossCrypto) {
    throw new Error(
      sellerId === params.userId
        ? `You need ${grossCrypto.toFixed(8)} ${listing.crypto_type} available in your wallet to sell.`
        : "The seller does not have enough available balance to fund escrow right now.",
    );
  }

  // Conditional debit: only succeeds while the free balance still covers the hold.
  const { data: held, error: holdErr } = await supabaseAdmin
    .from("wallets")
    .update({
      balance: wallet.balance - grossCrypto,
      held_balance: wallet.held_balance + grossCrypto,
    })
    .eq("id", wallet.id)
    .gte("balance", grossCrypto)
    .select("id")
    .maybeSingle();
  if (holdErr) throw new Error(holdErr.message);
  if (!held) throw new Error("Escrow hold failed — the seller's balance changed. Try again.");

  const { data: trade, error: tradeErr } = await supabaseAdmin
    .from("trades")
    .insert({
      listing_id: listing.id,
      buyer_id: buyerId,
      seller_id: sellerId,
      crypto_type: listing.crypto_type,
      amount: grossCrypto,
      price: effectivePrice,
      fee_amount: feeCrypto,
      payout_amount: netCrypto,
      expires_at: listing.payment_window_minutes
        ? new Date(Date.now() + listing.payment_window_minutes * 60_000).toISOString()
        : null,
      fiat_currency: listing.fiat_currency,
      payment_method: params.paymentMethod,
      status: "escrow_funded",
    })
    .select("id")
    .single();

  if (tradeErr || !trade) {
    // Roll the hold back so funds are never stranded.
    await supabaseAdmin
      .from("wallets")
      .update({ balance: wallet.balance, held_balance: wallet.held_balance })
      .eq("id", wallet.id);
    throw new Error(tradeErr?.message ?? "Could not open the trade");
  }

  await supabaseAdmin.from("transactions").insert({
    wallet_id: wallet.id,
    user_id: sellerId,
    trade_id: trade.id,
    type: "escrow_hold",
    amount: grossCrypto,
    crypto_type: listing.crypto_type,
    status: "completed",
  });

  return { tradeId: trade.id };
}

export async function claimPayment(params: { tradeId: string; userId: string }) {
  const trade = await loadTrade(params.tradeId, params.userId);
  if (trade.buyer_id !== params.userId) throw new Error("Only the buyer can confirm payment");
  if (trade.status !== "escrow_funded") throw new Error("Payment can only be confirmed while in escrow");

  // Require proof of payment (an attachment from the buyer in the trade chat)
  // before allowing the buyer to mark the trade as paid.
  const { count, error: proofErr } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("trade_id", trade.id)
    .eq("sender_id", params.userId)
    .not("attachment_url", "is", null);
  if (proofErr) throw new Error(proofErr.message);
  if (!count) {
    throw new Error("Attach proof of payment in the chat before marking the trade as paid.");
  }

  const { error } = await supabaseAdmin
    .from("trades")
    .update({ status: "payment_claimed" })
    .eq("id", trade.id)
    .eq("status", "escrow_funded");
  if (error) throw new Error(error.message);
  return { status: "payment_claimed" as const };
}

export async function releaseHold(params: { tradeId: string; userId: string }) {
  const trade = await loadTrade(params.tradeId, params.userId);
  if (trade.seller_id !== params.userId) throw new Error("Only the seller can release escrow");
  if (trade.status !== "escrow_funded" && trade.status !== "payment_claimed") {
    throw new Error("This trade is not in escrow");
  }

  // Claim the state transition first so a double-click cannot release twice.
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("trades")
    .update({ status: "released" })
    .eq("id", trade.id)
    .in("status", ["escrow_funded", "payment_claimed"])
    .select("id")
    .maybeSingle();
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed) throw new Error("This trade was already settled");

  const sellerWallet = await ensureWallet(trade.seller_id, trade.crypto_type);
  const buyerWallet = await ensureWallet(trade.buyer_id, trade.crypto_type);

  // The full held amount leaves the seller's hold; the buyer receives it minus
  // the platform fee that was locked in when the trade opened.
  await supabaseAdmin
    .from("wallets")
    .update({ held_balance: Math.max(0, sellerWallet.held_balance - trade.amount) })
    .eq("id", sellerWallet.id);
  await supabaseAdmin
    .from("wallets")
    .update({ balance: buyerWallet.balance + trade.payout_amount })
    .eq("id", buyerWallet.id);

  await supabaseAdmin.from("transactions").insert([
    {
      wallet_id: sellerWallet.id,
      user_id: trade.seller_id,
      trade_id: trade.id,
      type: "escrow_release",
      amount: -trade.amount,
      crypto_type: trade.crypto_type,
      status: "completed",
    },
    {
      wallet_id: buyerWallet.id,
      user_id: trade.buyer_id,
      trade_id: trade.id,
      type: "escrow_release",
      amount: trade.payout_amount,
      crypto_type: trade.crypto_type,
      status: "completed",
    },
  ]);

  await bumpTradesCompleted([trade.buyer_id, trade.seller_id]);

  const { notifyTradeEnded } = await import("@/lib/trade-notify.server");
  await notifyTradeEnded({ tradeId: trade.id, outcome: "released" });

  return { status: "released" as const };
}

export async function cancelAndRefund(params: { tradeId: string; userId: string }) {
  const trade = await loadTrade(params.tradeId, params.userId);
  if (trade.buyer_id !== params.userId) throw new Error("Only the buyer can cancel a trade");
  if (trade.status !== "escrow_funded" && trade.status !== "pending") {
    throw new Error("This trade can no longer be cancelled");
  }

  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("trades")
    .update({ status: "cancelled" })
    .eq("id", trade.id)
    .in("status", ["escrow_funded", "pending"])
    .select("id")
    .maybeSingle();
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed) throw new Error("This trade was already settled");

  await refundEscrow(trade);

  const { notifyTradeEnded } = await import("@/lib/trade-notify.server");
  await notifyTradeEnded({ tradeId: trade.id, outcome: "cancelled" });

  return { status: "cancelled" as const };
}

export async function raiseDispute(params: { tradeId: string; reason: string; userId: string }) {
  const trade = await loadTrade(params.tradeId, params.userId);
  if (trade.status !== "payment_claimed") {
    throw new Error("A dispute can only be opened after the buyer has marked payment as sent");
  }

  // Seller can dispute the moment payment is claimed; the buyer must wait 30
  // minutes (giving the seller a fair window to confirm) before disputing.
  if (params.userId === trade.buyer_id) {
    const elapsedMs = Date.now() - new Date(trade.updated_at).getTime();
    if (elapsedMs < BUYER_DISPUTE_WAIT_MS) {
      const minutesLeft = Math.ceil((BUYER_DISPUTE_WAIT_MS - elapsedMs) / 60_000);
      throw new Error(
        `You can open a dispute in ${minutesLeft} more minute${minutesLeft === 1 ? "" : "s"} — this gives the seller time to confirm your payment.`,
      );
    }
  }

  await enforceRateLimit({
    userId: params.userId,
    action: "dispute_open",
    limit: 5,
    windowSeconds: 3600,
  });

  const { error } = await supabaseAdmin.from("disputes").insert({
    trade_id: trade.id,
    raised_by: params.userId,
    reason: params.reason,
  });
  if (error) throw new Error(error.message);

  await supabaseAdmin.from("trades").update({ status: "disputed" }).eq("id", trade.id);
  // Funds stay held until an admin resolves the dispute.
  return { status: "disputed" as const };
}
