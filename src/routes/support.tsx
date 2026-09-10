import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { LifeBuoy, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — CEMP" },
      { name: "description", content: "Get help with a trade, your wallet, or your account." },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user) return;
    const trimmed = message.trim();
    if (trimmed.length < 5) {
      toast.error("Add a few more details");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("feedback")
      .insert({ user_id: user.id, message: `[support] ${trimmed}`, page_path: "/support" });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMessage("");
    toast.success("Sent — we'll get back to you by email");
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <LifeBuoy className="size-6" /> Support
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Stuck on a trade, a deposit, or your account? Check the{" "}
          <a href="/faq" className="text-primary underline-offset-2 hover:underline">
            FAQ
          </a>{" "}
          first — most questions about escrow and wallets are answered there.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 py-5">
          {user ? (
            <>
              <p className="text-sm font-medium">Contact us</p>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe what's going on — include a trade ID if it's about a specific trade."
                rows={4}
              />
              <Button size="sm" disabled={busy || !message.trim()} onClick={submit}>
                {busy ? "Sending…" : "Send"}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Sign in to send a support request from here.</p>
          )}
          <p className="flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
            <Mail className="size-3.5" /> Or email us directly at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline-offset-2 hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
