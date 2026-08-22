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
      .select("id, sender_id, content, attachment_url, created_at")
      .eq("trade_id", data.tradeId)
      .order("created_at", { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((m) => ({ ...m, mine: m.sender_id === context.userId }));
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tradeId: string; content?: string | undefined; attachmentUrl?: string | undefined }) => {
    if (!UUID.test(input.tradeId)) throw new Error("Invalid trade id");
    const content = (input.content ?? "").trim();
    if (!content && !input.attachmentUrl) throw new Error("Write a message or attach a file");
    if (content.length > 2000) throw new Error("Message is too long");
    return { tradeId: input.tradeId, content, attachmentUrl: input.attachmentUrl ?? null };
  })
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    await enforceRateLimit({
      userId: context.userId,
      action: "chat_message",
      limit: 30,
      windowSeconds: 60,
    });

    const { data: row, error } = await context.supabase
      .from("messages")
      .insert({
        trade_id: data.tradeId,
        sender_id: context.userId,
        content: data.content || null,
        attachment_url: data.attachmentUrl,
      })
      .select("id, sender_id, content, attachment_url, created_at")
      .single();
    if (error) throw new Error(error.message);

    const { notifyNewMessage } = await import("@/lib/message-notify.server");
    await notifyNewMessage({ tradeId: data.tradeId, senderId: context.userId, content: data.content });

    return { ...row, mine: true };
  });
