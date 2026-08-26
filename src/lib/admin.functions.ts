import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [users, listings, trades, disputes, wallets] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("listings").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabaseAdmin.from("trades").select("status, amount, price, crypto_type"),
      supabaseAdmin.from("disputes").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabaseAdmin.from("wallets").select("crypto_type, held_balance"),
    ]);

    const rows = trades.data ?? [];
    const byStatus: Record<string, number> = {};
    let settledVolume = 0;
    for (const t of rows) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      if (t.status === "released") settledVolume += Number(t.amount) * Number(t.price);
    }

    const held: Record<string, number> = {};
    for (const w of wallets.data ?? []) {
      const v = Number(w.held_balance);
      if (v > 0) held[w.crypto_type] = (held[w.crypto_type] ?? 0) + v;
    }

    return {
      users: users.count ?? 0,
      activeListings: listings.count ?? 0,
      totalTrades: rows.length,
      openDisputes: disputes.count ?? 0,
      byStatus,
      settledVolume,
      held,
    };
  });

export const listAllTrades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: string; search?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("trades")
      .select(
        "id, crypto_type, amount, price, fiat_currency, payment_method, status, created_at, buyer_id, seller_id, buyer:profiles!trades_buyer_id_fkey(display_name, email), seller:profiles!trades_seller_id_fkey(display_name, email)",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (data.status && data.status !== "all") query = query.eq("status", data.status as never);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const term = (data.search ?? "").trim().toLowerCase();
    return (rows ?? [])
      .map((t) => ({ ...t, amount: Number(t.amount), price: Number(t.price) }))
      .filter((t) =>
        !term
          ? true
          : [t.id, t.buyer?.display_name, t.buyer?.email, t.seller?.display_name, t.seller?.email]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(term)),
      );
  });

export const listDisputes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: "open" | "resolved" | "all" }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("disputes")
      .select(
        "id, trade_id, reason, status, admin_notes, created_at, raised_by, raiser:profiles!disputes_raised_by_fkey(display_name), trade:trades!disputes_trade_id_fkey(crypto_type, amount, price, fiat_currency, status, payment_method, buyer:profiles!trades_buyer_id_fkey(display_name), seller:profiles!trades_seller_id_fkey(display_name))",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getDisputeThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tradeId: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.tradeId)) throw new Error("Invalid trade id");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: messages, error } = await supabaseAdmin
      .from("messages")
      .select("id, content, attachment_url, created_at, sender:profiles!messages_sender_id_fkey(display_name)")
      .eq("trade_id", data.tradeId)
      .order("created_at", { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);
    return messages ?? [];
  });

export const resolveDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { disputeId: string; resolution: "release_to_buyer" | "refund_to_seller"; notes: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.disputeId)) throw new Error("Invalid dispute id");
    if (input.resolution !== "release_to_buyer" && input.resolution !== "refund_to_seller") {
      throw new Error("Choose a resolution");
    }
    if (!input.notes || input.notes.trim().length < 5) throw new Error("Add a short resolution note");
    if (input.notes.length > 2000) throw new Error("Note is too long");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { assertAdmin, resolveDisputeServer } = await import("@/lib/admin.server");
    await assertAdmin(context.supabase, context.userId);
    return resolveDisputeServer({
      disputeId: data.disputeId,
      resolution: data.resolution,
      notes: data.notes.trim(),
      adminId: context.userId,
    });
  });

export const listDepositClaims = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: "pending" | "verified" | "rejected" | "all" }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("deposit_claims")
      .select(
        "id, crypto_type, network, claimed_amount, verified_amount, tx_hash, status, rejection_reason, confirmations, attempt_count, created_at, last_checked_at, user:profiles!deposit_claims_user_id_fkey(display_name, email)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getDepositClaimLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { claimId: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.claimId)) throw new Error("Invalid claim id");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("deposit_verification_log")
      .select("id, attempt_at, result, details")
      .eq("deposit_claim_id", data.claimId)
      .order("attempt_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const rejectDepositClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { claimId: string; reason: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.claimId)) throw new Error("Invalid claim id");
    if (!input.reason || input.reason.trim().length < 3) throw new Error("Add a short rejection reason");
    if (input.reason.length > 1000) throw new Error("Reason is too long");
    return { claimId: input.claimId, reason: input.reason.trim() };
  })
  .handler(async ({ data, context }) => {
    const { assertAdmin, rejectDepositClaimServer } = await import("@/lib/admin.server");
    await assertAdmin(context.supabase, context.userId);
    return rejectDepositClaimServer(data);
  });

export const reverifyDepositClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { claimId: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.claimId)) throw new Error("Invalid claim id");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.supabase, context.userId);
    const { runVerificationAndMaybeCredit } = await import("@/lib/deposit-verification.server");
    return runVerificationAndMaybeCredit(data.claimId);
  });

export const listMasterWallets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("master_wallets")
      .select("id, crypto_type, network, label, address, token_contract_address, warning_message, min_confirmations, active")
      .order("crypto_type")
      .order("network");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertMasterWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    cryptoType: string;
    network: string;
    label: string;
    address: string;
    tokenContractAddress?: string | null;
    warningMessage: string;
    minConfirmations: number;
    active: boolean;
  }) => {
    if (!input.cryptoType.trim()) throw new Error("Coin is required");
    if (!input.network.trim()) throw new Error("Network is required");
    if (!input.label.trim()) throw new Error("Label is required");
    const address = input.address.trim();
    if (address.length < 10 || address.length > 120) throw new Error("Enter a valid wallet address");
    const minConfirmations = Number(input.minConfirmations);
    if (!Number.isFinite(minConfirmations) || minConfirmations < 0) throw new Error("Enter a valid confirmation count");
    return {
      id: input.id,
      cryptoType: input.cryptoType.trim().toUpperCase(),
      network: input.network.trim(),
      label: input.label.trim(),
      address,
      tokenContractAddress: input.tokenContractAddress?.trim() || null,
      warningMessage: input.warningMessage.trim(),
      minConfirmations,
      active: !!input.active,
    };
  })
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const row = {
      crypto_type: data.cryptoType,
      network: data.network,
      label: data.label,
      address: data.address,
      token_contract_address: data.tokenContractAddress,
      warning_message: data.warningMessage,
      min_confirmations: data.minConfirmations,
      active: data.active,
    };

    const { data: saved, error } = data.id
      ? await supabaseAdmin.from("master_wallets").update(row).eq("id", data.id).select().single()
      : await supabaseAdmin.from("master_wallets").insert(row).select().single();
    if (error) throw new Error(error.message);
    return saved;
  });
