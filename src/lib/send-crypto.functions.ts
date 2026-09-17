import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CRYPTO_TYPES } from "@/lib/constants";

const CODES = CRYPTO_TYPES.map((c) => c.code) as readonly string[];

// Deliberately not shared with swap.server.ts's own copy — see the note
// there about a production-only Rolldown circular-chunk bug from sharing it.
async function ensureWallet(userId: string, cryptoType: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("wallets")
    .select("id, balance")
    .eq("user_id", userId)
    .eq("crypto_type", cryptoType)
    .maybeSingle();
  if (data) return { id: data.id, balance: Number(data.balance) };

  const { data: created, error } = await supabaseAdmin
    .from("wallets")
    .insert({ user_id: userId, crypto_type: cryptoType })
    .select("id, balance")
    .single();
  if (error) throw new Error(error.message);
  return { id: created.id, balance: Number(created.balance) };
}

/**
 * Resolves a display name to a profile id, for the wallet page's "Send to
 * a CEMP username" withdrawal path. display_name has no uniqueness
 * constraint in this schema, so an ambiguous match refuses to guess —
 * silently picking one of several same-named accounts would misroute funds.
 */
export const findTraderByDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { displayName: string }) => {
    const displayName = input.displayName.trim();
    if (!displayName) throw new Error("Enter a username");
    return { displayName };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: matches, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .ilike("display_name", data.displayName)
      .limit(2);
    if (error) throw new Error(error.message);
    if (!matches || matches.length === 0) throw new Error("No trader found with that username");
    if (matches.length > 1) {
      throw new Error("Multiple traders share that username — ask them for their profile link instead");
    }
    const match = matches[0]!;
    if (match.id === context.userId) throw new Error("That's your own account");
    return { userId: match.id, displayName: match.display_name };
  });

/**
 * Internal wallet-to-wallet transfer to another trader — no counterparty
 * lookup by email/username, the recipient is whichever profile the "Send
 * crypto" button was clicked from. Same risk class as an on-chain withdrawal
 * (an irreversible outbound move), so it's gated by the same step-up setting.
 */
export const sendCrypto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    recipientUserId: string;
    cryptoType: string;
    amount: number;
    note?: string;
    stepUpCode?: string;
  }) => {
    if (!CODES.includes(input.cryptoType)) throw new Error("Unsupported coin");
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");
    if (!/^[0-9a-f-]{36}$/i.test(input.recipientUserId)) throw new Error("Invalid recipient");
    const note = input.note?.trim().slice(0, 200) || null;
    return { recipientUserId: input.recipientUserId, cryptoType: input.cryptoType, amount, note, stepUpCode: input.stepUpCode };
  })
  .handler(async ({ data, context }) => {
    if (data.recipientUserId === context.userId) throw new Error("You can't send crypto to yourself");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");

    await enforceRateLimit({
      userId: context.userId,
      action: "send_crypto",
      limit: 10,
      windowSeconds: 3600,
    });

    const { data: recipient, error: recipientErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", data.recipientUserId)
      .maybeSingle();
    if (recipientErr) throw new Error(recipientErr.message);
    if (!recipient) throw new Error("Recipient not found");

    const { data: securityProfile, error: secErr } = await supabaseAdmin
      .from("profiles")
      .select("withdrawal_verification")
      .eq("id", context.userId)
      .single();
    if (secErr) throw new Error(secErr.message);

    const { requireStepUp } = await import("@/lib/step-up.server");
    await requireStepUp({
      supabase: context.supabase,
      userId: context.userId,
      purpose: "withdrawal",
      method: securityProfile.withdrawal_verification as "none" | "email" | "totp",
      code: data.stepUpCode ?? null,
    });

    const senderWallet = await ensureWallet(context.userId, data.cryptoType);

    const { data: debited, error: debitErr } = await supabaseAdmin
      .from("wallets")
      .update({ balance: senderWallet.balance - data.amount })
      .eq("id", senderWallet.id)
      .gte("balance", data.amount)
      .select("id")
      .maybeSingle();
    if (debitErr) throw new Error(debitErr.message);
    if (!debited) throw new Error("Not enough balance available");

    const recipientWallet = await ensureWallet(data.recipientUserId, data.cryptoType);
    const { error: creditErr } = await supabaseAdmin
      .from("wallets")
      .update({ balance: recipientWallet.balance + data.amount })
      .eq("id", recipientWallet.id);
    if (creditErr) {
      await supabaseAdmin.from("wallets").update({ balance: senderWallet.balance }).eq("id", senderWallet.id);
      throw new Error(creditErr.message);
    }

    await supabaseAdmin.from("transactions").insert([
      {
        wallet_id: senderWallet.id,
        user_id: context.userId,
        counterparty_id: data.recipientUserId,
        type: "transfer_out",
        amount: data.amount,
        crypto_type: data.cryptoType,
        status: "completed",
      },
      {
        wallet_id: recipientWallet.id,
        user_id: data.recipientUserId,
        counterparty_id: context.userId,
        type: "transfer_in",
        amount: data.amount,
        crypto_type: data.cryptoType,
        status: "completed",
      },
    ]);

    return { ok: true as const };
  });
