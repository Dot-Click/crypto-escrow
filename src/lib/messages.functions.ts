import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID = /^[0-9a-f-]{36}$/i;

export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tradeId: string }) => {
    if (!UUID.test(input.tradeId)) throw new Error("Invalid trade id");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("messages")
      .select("id, sender_id, content, attachment_url, created_at, reply_to_id")
      .eq("trade_id", data.tradeId)
      .order("created_at", { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((m) => ({ ...m, mine: m.sender_id === context.userId }));
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    tradeId: string;
    content?: string | undefined;
    attachmentUrl?: string | undefined;
    replyToId?: string | undefined;
  }) => {
    if (!UUID.test(input.tradeId)) throw new Error("Invalid trade id");
    if (input.replyToId && !UUID.test(input.replyToId)) throw new Error("Invalid reply message id");
    const content = (input.content ?? "").trim();
    if (!content && !input.attachmentUrl) throw new Error("Write a message or attach a file");
    if (content.length > 2000) throw new Error("Message is too long");
    return {
      tradeId: input.tradeId,
      content,
      attachmentUrl: input.attachmentUrl ?? null,
      replyToId: input.replyToId ?? null,
    };
  })
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    await enforceRateLimit({
      userId: context.userId,
      action: "chat_message",
      limit: 30,
      windowSeconds: 60,
    });

    // A reply must point at a message in the same trade — otherwise a party
    // could reference an arbitrary message id from a trade they're not in.
    if (data.replyToId) {
      const { data: target } = await context.supabase
        .from("messages")
        .select("id")
        .eq("id", data.replyToId)
        .eq("trade_id", data.tradeId)
        .maybeSingle();
      if (!target) throw new Error("That message no longer exists");
    }

    // Chat stays open after a trade is released or cancelled — either party
    // may still need to raise a problem after the fact (see Report a
    // problem, which is likewise available any time), so it's deliberately
    // not locked once the trade closes.
    const { data: row, error } = await context.supabase
      .from("messages")
      .insert({
        trade_id: data.tradeId,
        sender_id: context.userId,
        content: data.content || null,
        attachment_url: data.attachmentUrl,
        reply_to_id: data.replyToId,
      })
      .select("id, sender_id, content, attachment_url, created_at, reply_to_id")
      .single();
    if (error) throw new Error(error.message);

    const { notifyNewMessage } = await import("@/lib/message-notify.server");
    await notifyNewMessage({ tradeId: data.tradeId, senderId: context.userId, content: data.content });

    return { ...row, mine: true };
  });
