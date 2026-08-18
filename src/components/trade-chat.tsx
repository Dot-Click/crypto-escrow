import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listMessages, sendMessage } from "@/lib/messages.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const BUCKET = "trade-attachments";
const MAX_BYTES = 5 * 1024 * 1024;

function AttachmentImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 30)
      .then(({ data }) => {
        if (active) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [path]);

  if (!url) {
    return <div className="mt-2 h-24 w-40 animate-pulse rounded-md bg-muted" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-2 block">
      <img
        src={url}
        alt="Payment proof attachment"
        loading="lazy"
        className="max-h-56 w-auto max-w-full rounded-md border border-border object-contain"
      />
    </a>
  );
}

export function TradeChat({
  tradeId,
  counterpartyName,
  disabled,
}: {
  tradeId: string;
  counterpartyName: string;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const fetchMessages = useServerFn(listMessages);
  const sendFn = useServerFn(sendMessage);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const queryKey = useMemo(() => ["messages", tradeId], [tradeId]);
  const messages = useQuery({
    queryKey,
    queryFn: () => fetchMessages({ data: { tradeId } }),
    refetchInterval: 15000,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`trade-chat-${tradeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `trade_id=eq.${tradeId}` },
        () => {
          void qc.invalidateQueries({ queryKey });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tradeId, qc, queryKey]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages.data?.length]);

  const send = useMutation({
    mutationFn: async () => {
      let attachmentUrl: string | undefined;
      if (file) {
        if (file.size > MAX_BYTES) throw new Error("Attachment must be 5 MB or smaller");
        setUploading(true);
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
        const path = `${tradeId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || "application/octet-stream",
        });
        setUploading(false);
        if (error) throw new Error(error.message);
        attachmentUrl = path;
      }
      return sendFn({ data: { tradeId, content: text, attachmentUrl } });
    },
    onSuccess: () => {
      setText("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      void qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => {
      setUploading(false);
      toast.error(e.message);
    },
  });

  const busy = send.isPending || uploading;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Chat with {counterpartyName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-[22rem] min-h-40 space-y-3 overflow-y-auto rounded-md border border-border bg-muted/20 p-3">
          {messages.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading messages…</p>
          ) : (messages.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No messages yet. Share payment details or proof here — never off-platform.
            </p>
          ) : (
            (messages.data ?? []).map((m) => (
              <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm sm:max-w-[75%] ${
                    m.mine
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card text-foreground"
                  }`}
                >
                  {m.content ? <p className="whitespace-pre-line break-words">{m.content}</p> : null}
                  {m.attachment_url ? <AttachmentImage path={m.attachment_url} /> : null}
                  <p className={`mt-1 text-[10px] ${m.mine ? "opacity-70" : "text-muted-foreground"}`}>
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={bottom} />
        </div>

        {disabled ? (
          <p className="text-xs text-muted-foreground">
            This trade is closed — chat is read-only.
          </p>
        ) : (
          <div className="space-y-2">
            {file ? (
              <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
                <Paperclip className="size-3.5 shrink-0" />
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  className="ml-auto text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setFile(null);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                  aria-label="Remove attachment"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!busy && (text.trim() || file)) send.mutate();
                  }
                }}
                placeholder="Message your counterparty…"
                rows={2}
                className="min-h-[44px] resize-none"
              />
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                onClick={() => fileInput.current?.click()}
                aria-label="Attach payment proof"
              >
                <Paperclip className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                className="size-11 shrink-0"
                disabled={busy || (!text.trim() && !file)}
                onClick={() => send.mutate()}
                aria-label="Send message"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Images up to 5 MB. Keep all payment proof in this chat — admins review it during disputes.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
