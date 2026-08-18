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
