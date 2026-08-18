// Server-only admin helpers. Escrow resolutions stay inside the internal
// ledger: a hold either moves to the buyer or returns to the seller.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Verifies the caller is an admin using their own RLS-scoped client. */
export async function assertAdmin(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admin access required");
  return true;
}

async function walletFor(userId: string, cryptoType: string) {
  const { data } = await supabaseAdmin
    .from("wallets")
    .select("id, balance, held_balance")
    .eq("user_id", userId)
    .eq("crypto_type", cryptoType)
    .maybeSingle();
  if (data) {
    return { ...data, balance: Number(data.balance), held_balance: Number(data.held_balance) };
  }
  const { data: created, error } = await supabaseAdmin
    .from("wallets")
    .insert({ user_id: userId, crypto_type: cryptoType })
    .select("id, balance, held_balance")
    .single();
  if (error) throw new Error(error.message);
  return { ...created, balance: Number(created.balance), held_balance: Number(created.held_balance) };
}

export type DisputeResolution = "release_to_buyer" | "refund_to_seller";

export async function resolveDisputeServer(params: {
  disputeId: string;
  resolution: DisputeResolution;
  notes: string;
  adminId: string;
}) {
  const { data: dispute, error } = await supabaseAdmin
    .from("disputes")
    .select("id, trade_id, status")
    .eq("id", params.disputeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!dispute) throw new Error("Dispute not found");
  if (dispute.status === "resolved") throw new Error("This dispute is already resolved");

  const { data: trade, error: tradeErr } = await supabaseAdmin
    .from("trades")
    .select("id, buyer_id, seller_id, crypto_type, amount, status")
    .eq("id", dispute.trade_id)
    .maybeSingle();
  if (tradeErr) throw new Error(tradeErr.message);
  if (!trade) throw new Error("Trade not found");

  const amount = Number(trade.amount);
  const nextStatus = params.resolution === "release_to_buyer" ? "released" : "cancelled";

  // Claim the transition so a double submit cannot move funds twice.
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("trades")
    .update({ status: nextStatus })
    .eq("id", trade.id)
    .eq("status", "disputed")
    .select("id")
    .maybeSingle();
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed) throw new Error("This trade is no longer in a disputed state");

  const sellerWallet = await walletFor(trade.seller_id, trade.crypto_type);

  if (params.resolution === "release_to_buyer") {
    const buyerWallet = await walletFor(trade.buyer_id, trade.crypto_type);
    await supabaseAdmin
      .from("wallets")
      .update({ held_balance: Math.max(0, sellerWallet.held_balance - amount) })
      .eq("id", sellerWallet.id);
    await supabaseAdmin
      .from("wallets")
      .update({ balance: buyerWallet.balance + amount })
      .eq("id", buyerWallet.id);
    await supabaseAdmin.from("transactions").insert([
      {
        wallet_id: sellerWallet.id,
        user_id: trade.seller_id,
        trade_id: trade.id,
        type: "escrow_release",
        amount: -amount,
        crypto_type: trade.crypto_type,
        status: "completed",
      },
      {
        wallet_id: buyerWallet.id,
        user_id: trade.buyer_id,
        trade_id: trade.id,
        type: "escrow_release",
        amount,
        crypto_type: trade.crypto_type,
        status: "completed",
      },
    ]);
  } else {
    await supabaseAdmin
      .from("wallets")
      .update({
        balance: sellerWallet.balance + amount,
        held_balance: Math.max(0, sellerWallet.held_balance - amount),
      })
      .eq("id", sellerWallet.id);
    await supabaseAdmin.from("transactions").insert({
      wallet_id: sellerWallet.id,
      user_id: trade.seller_id,
      trade_id: trade.id,
      type: "escrow_refund",
      amount,
      crypto_type: trade.crypto_type,
      status: "completed",
    });
  }

  await supabaseAdmin
    .from("disputes")
    .update({
      status: "resolved",
      admin_notes: `[${params.resolution}] ${params.notes}`.slice(0, 4000),
    })
    .eq("id", dispute.id);

  return { status: nextStatus as "released" | "cancelled" };
}
