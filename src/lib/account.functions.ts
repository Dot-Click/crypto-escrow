import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OPEN_TRADE_STATUSES = ["pending", "escrow_funded", "payment_claimed", "disputed"] as const;

/**
 * Soft account closure, matching the policy SafeTheTrade documents: "close
 * your account at any time once no trade is open. Withdraw your balances
 * first." We never hard-delete the auth user or the profiles row — trades,
 * listings, messages and transactions all FK to profiles.id, and ledger/
 * dispute history has to survive closure. Instead we ban the auth user
 * (blocks future logins) and stamp `closed_at` for display purposes.
 */
export const closeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { count: openTrades, error: tradesErr } = await supabaseAdmin
      .from("trades")
      .select("id", { count: "exact", head: true })
      .in("status", OPEN_TRADE_STATUSES)
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
    if (tradesErr) throw new Error(tradesErr.message);
    if (openTrades && openTrades > 0) {
      throw new Error("You have an open trade — finish or cancel it before closing your account.");
    }

    const { data: wallets, error: walletsErr } = await supabaseAdmin
      .from("wallets")
      .select("crypto_type, balance, held_balance")
      .eq("user_id", userId);
    if (walletsErr) throw new Error(walletsErr.message);
    const nonZero = (wallets ?? []).find((w) => Number(w.balance) > 0 || Number(w.held_balance) > 0);
    if (nonZero) {
      throw new Error(`Withdraw your ${nonZero.crypto_type} balance before closing your account.`);
    }

    // GoTrue has no permanent-ban value — a long duration is the accepted
    // way to block logins indefinitely without deleting the auth record.
    const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: "87600h",
    });
    if (banErr) throw new Error(banErr.message);

    const { error: closeErr } = await supabaseAdmin
      .from("profiles")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", userId);
    if (closeErr) throw new Error(closeErr.message);

    return { success: true };
  });
