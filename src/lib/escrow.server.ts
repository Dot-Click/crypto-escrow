// Server-only escrow engine. Escrow is an internal ledger hold on the seller's
// wallet balance (balance -> held_balance), never a new blockchain transaction.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enforceRateLimit } from "@/lib/rate-limit.server";

type TradeRow = {
  id: string;
  buyer_id: string;
  seller_id: string;
  crypto_type: string;
  amount: number;
  status: string;
  updated_at: string;
};

async function loadTrade(tradeId: string, userId: string): Promise<TradeRow> {
  const { data, error } = await supabaseAdmin
    .from("trades")
    .select("id, buyer_id, seller_id, crypto_type, amount, status, updated_at")
    .eq("id", tradeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Trade not found");
  if (data.buyer_id !== userId && data.seller_id !== userId) {
    throw new Error("You are not a party to this trade");
  }
  return { ...data, amount: Number(data.amount) };
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
  amount: number;
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
    .select("id, seller_id, side, crypto_type, amount, price, fiat_currency, accepted_payment_methods, status")
    .eq("id", params.listingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!listing || listing.status !== "active") throw new Error("This offer is no longer available");
  if (listing.seller_id === params.userId) throw new Error("You cannot trade with your own offer");
  if (params.amount > Number(listing.amount)) {
    throw new Error(`This offer covers at most ${listing.amount} ${listing.crypto_type}`);
  }
  if (!listing.accepted_payment_methods.includes(params.paymentMethod)) {
    throw new Error("That payment method is not accepted on this offer");
  }

  // On a "sell" offer the lister sells crypto; on a "buy" offer the visitor sells.
  const sellerId = listing.side === "sell" ? listing.seller_id : params.userId;
  const buyerId = listing.side === "sell" ? params.userId : listing.seller_id;

  const wallet = await ensureWallet(sellerId, listing.crypto_type);
  if (wallet.balance < params.amount) {
    throw new Error(
      sellerId === params.userId
        ? `You need ${params.amount} ${listing.crypto_type} available in your wallet to sell.`
        : "The seller does not have enough available balance to fund escrow right now.",
    );
  }

  // Conditional debit: only succeeds while the free balance still covers the hold.
  const { data: held, error: holdErr } = await supabaseAdmin
    .from("wallets")
    .update({
      balance: wallet.balance - params.amount,
      held_balance: wallet.held_balance + params.amount,
    })
    .eq("id", wallet.id)
    .gte("balance", params.amount)
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
      amount: params.amount,
      price: Number(listing.price),
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
    amount: params.amount,
    crypto_type: listing.crypto_type,
    status: "completed",
  });

  return { tradeId: trade.id };
}

export async function claimPayment(params: { tradeId: string; userId: string }) {
  const trade = await loadTrade(params.tradeId, params.userId);
  if (trade.buyer_id !== params.userId) throw new Error("Only the buyer can confirm payment");
  if (trade.status !== "escrow_funded") throw new Error("Payment can only be confirmed while in escrow");

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

  await supabaseAdmin
    .from("wallets")
    .update({ held_balance: Math.max(0, sellerWallet.held_balance - trade.amount) })
    .eq("id", sellerWallet.id);
  await supabaseAdmin
    .from("wallets")
    .update({ balance: buyerWallet.balance + trade.amount })
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
      amount: trade.amount,
      crypto_type: trade.crypto_type,
      status: "completed",
    },
  ]);

  await bumpTradesCompleted([trade.buyer_id, trade.seller_id]);
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
