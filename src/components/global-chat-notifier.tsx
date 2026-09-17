// App-wide "new chat message" chime — previously this only played while the
// specific trade's chat page happened to be open (trade-chat.tsx's own
// realtime subscription), so a message on any other trade, or while
// browsing elsewhere in the app, was silent. Mounted once in the
// authenticated layout instead, so it fires no matter which page is open.
//
// No trade-id filtering needed: RLS on `messages` (is_trade_party) means
// this client only ever receives INSERT events for trades it's actually a
// party to, so an unfiltered subscription is already scoped correctly.
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { playMessageSound } from "@/lib/notification-sound";

export function GlobalChatNotifier() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`global-chat-notify-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as { sender_id?: string };
          if (row.sender_id && row.sender_id !== user.id) {
            playMessageSound();
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return null;
}
