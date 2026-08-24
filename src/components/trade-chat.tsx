import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Paperclip, Send, X, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { listMessages, sendMessage } from "@/lib/messages.functions";
import { playMessageSound } from "@/lib/notification-sound";
import { RAIL_DETAIL_FIELDS } from "@/lib/payment-method-fields";
import { railKeyForMethod } from "@/lib/payment-taxonomy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export type TradePaymentDetails = {
  method: string;
  label: string | null;
  // Stored as JSONB (Supabase's Json type = scalar | array | object) — we
  // only ever render simple string fields (per RAIL_DETAIL_FIELDS), so we
  // accept unknown and coerce at read time.
  details: unknown;
};

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

function PaymentDetailsBubble({
  details,
  sellerName,
}: {
  details: TradePaymentDetails;
  sellerName: string;
}) {
  const railKey = railKeyForMethod(details.method);
  const fields = railKey ? RAIL_DETAIL_FIELDS[railKey] ?? [] : [];
  const bag =
    details.details && typeof details.details === "object" && !Array.isArray(details.details)
      ? (details.details as Record<string, unknown>)
      : {};
  const visibleFields = fields
    .map((f) => ({ ...f, value: typeof bag[f.key] === "string" ? (bag[f.key] as string) : "" }))
    .filter((f) => f.value.trim());

  return (
    <div className="flex justify-start">
      <div className="max-w-[95%] rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm sm:max-w-[85%]">
        <div className="flex items-center gap-2 text-xs font-medium text-primary">
          <Wallet className="size-3.5" /> Payment details from {sellerName}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {details.label ? (
            <>
              <span className="text-foreground">{details.label}</span> · {details.method}
            </>
          ) : (
            details.method
          )}
        </p>
        {visibleFields.length > 0 ? (
          <div className="mt-2 space-y-1">
            {visibleFields.map((f) => (
              <div key={f.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {f.label}
                </span>
                <span className="mono break-all text-sm text-foreground">{f.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function TradeChat({
  tradeId,
  counterpartyName,
  paymentDetails,
  sellerName,
  disabled,
  hideHeader = false,
  banner,
  className,
}: {
  tradeId: string;
  counterpartyName: string;
  paymentDetails?: TradePaymentDetails | null;
  sellerName?: string;
  disabled?: boolean;
  /** Skip the built-in "Chat with X" header — for embedding under a custom page-level header. */
  hideHeader?: boolean;
  /** Colored status strip rendered above the message log (e.g. "Buying 0.01 BTC for $50 via Bank transfer"). */
  banner?: ReactNode;
  className?: string;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
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
        (payload) => {
          const row = payload.new as { sender_id?: string };
          if (row.sender_id && row.sender_id !== user?.id) {
            playMessageSound();
          }
          void qc.invalidateQueries({ queryKey });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tradeId, qc, queryKey, user?.id]);

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
    <Card className={className ?? "mb-4 flex flex-col"}>
      {hideHeader ? null : (
        <CardHeader className="shrink-0 pb-3">
          <CardTitle className="text-base">Chat with {counterpartyName}</CardTitle>
        </CardHeader>
      )}
      {banner ? <div className="shrink-0 border-b border-border">{banner}</div> : null}
      <CardContent className="flex min-h-0 flex-1 flex-col space-y-3 pt-4">
        <div className="min-h-40 flex-1 space-y-3 overflow-y-auto rounded-md border border-border bg-muted/20 p-3">
          {paymentDetails ? (
            <PaymentDetailsBubble
              details={paymentDetails}
              sellerName={sellerName ?? counterpartyName}
            />
          ) : null}
          {messages.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading messages…</p>
          ) : (messages.data ?? []).length === 0 && !paymentDetails ? (
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
          <p className="shrink-0 text-xs text-muted-foreground">
            This trade is closed — chat is read-only.
          </p>
        ) : (
          <div className="shrink-0 space-y-2">
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
