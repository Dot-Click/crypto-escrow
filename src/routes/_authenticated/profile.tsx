import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { RAIL_DETAIL_FIELDS, summarizeDetails } from "@/lib/payment-method-fields";
import { railKeyForMethod } from "@/lib/payment-taxonomy";
import { PaymentMethodPicker } from "@/components/payment-method-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your profile — EscrowP2P" },
      {
        name: "description",
        content: "Manage your EscrowP2P trader profile, display name, trading role and offers.",
      },
      { property: "og:title", content: "Your profile — EscrowP2P" },
      {
        property: "og:description",
        content: "Manage your trader profile and your published offers.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"buyer" | "seller" | "both">("both");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setRole(profile.role);
    }
  }, [profile]);

  const myListings = useQuery({
    queryKey: ["my-listings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("seller_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [newMethod, setNewMethod] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newFields, setNewFields] = useState<Record<string, string>>({});
  const [savingMethod, setSavingMethod] = useState(false);
  const newRailKey = newMethod ? railKeyForMethod(newMethod) : null;

  const paymentMethods = useQuery({
    queryKey: ["payment-methods", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("id, method, label, details, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addPaymentMethod = async () => {
    if (!user) return;
    if (!newMethod || !newRailKey) {
      toast.error("Choose a payment method");
      return;
    }
    const fields = RAIL_DETAIL_FIELDS[newRailKey] ?? [];
    for (const f of fields) {
      if (!f.optional && !newFields[f.key]?.trim()) {
        toast.error(`Enter ${f.label.toLowerCase()}`);
        return;
      }
    }
    setSavingMethod(true);
    const { error } = await supabase.from("payment_methods").insert({
      user_id: user.id,
      method: newMethod,
      label: newLabel.trim() || null,
      details: fields.reduce<Record<string, string>>((acc, f) => {
        const value = newFields[f.key]?.trim();
        if (value) acc[f.key] = value;
        return acc;
      }, {}),
    });
    setSavingMethod(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewMethod(null);
    setNewLabel("");
    setNewFields({});
    await queryClient.invalidateQueries({ queryKey: ["payment-methods", user.id] });
    toast.success("Payment method saved");
  };

  const deletePaymentMethod = async (id: string) => {
    const { error } = await supabase.from("payment_methods").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["payment-methods", user?.id] });
  };

  const save = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName, role })
      .eq("id", user.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshProfile();
    toast.success("Profile updated");
  };

  const setStatus = async (id: string, status: "active" | "paused") => {
    const { error } = await supabase.from("listings").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["my-listings", user?.id] });
    await queryClient.invalidateQueries({ queryKey: ["listings"] });
  };

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>{user?.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dn">Display name</Label>
              <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Trading role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buyer">Buyer</SelectItem>
                  <SelectItem value="seller">Seller</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Completed trades: <span className="mono">{profile?.trades_completed ?? 0}</span>
          </p>
          <Button onClick={save} disabled={busy}>
            Save changes
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved payment methods</CardTitle>
          <CardDescription>
            Save your account details once and attach them to offers — no more retyping them into
            every trade chat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {paymentMethods.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (paymentMethods.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved payment methods yet.</p>
          ) : (
            <div className="space-y-2">
              {(paymentMethods.data ?? []).map((pm) => (
                <div
                  key={pm.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="outline">{pm.method}</Badge>
                    <span className="text-muted-foreground">
                      {pm.label ? `${pm.label} · ` : ""}
                      {summarizeDetails(railKeyForMethod(pm.method) ?? "", pm.details as Record<string, string>)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Delete payment method"
                    onClick={() => deletePaymentMethod(pm.id)}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Method</Label>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setPickerOpen(true)}
                >
                  {newMethod ?? "Choose a payment method"}
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pm-label">Name it (optional)</Label>
                <Input
                  id="pm-label"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Main account"
                />
              </div>
            </div>
            {newRailKey
              ? (RAIL_DETAIL_FIELDS[newRailKey] ?? []).map((f) => (
                  <div key={f.key} className="space-y-2">
                    <Label htmlFor={`pm-${f.key}`}>
                      {f.label} {f.optional ? <span className="text-muted-foreground">(optional)</span> : null}
                    </Label>
                    <Input
                      id={`pm-${f.key}`}
                      value={newFields[f.key] ?? ""}
                      onChange={(e) => setNewFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                    />
                  </div>
                ))
              : null}
            <Button size="sm" disabled={savingMethod || !newMethod} onClick={addPaymentMethod}>
              Save payment method
            </Button>
          </div>
        </CardContent>
      </Card>

      <PaymentMethodPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selected={newMethod ? [newMethod] : []}
        onChange={(methods) => {
          setNewMethod(methods[0] ?? null);
          setNewFields({});
        }}
        multiple={false}
      />

      <Card>
        <CardHeader>
          <CardTitle>Your offers</CardTitle>
          <CardDescription>Pause an offer to hide it from the marketplace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {myListings.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (myListings.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">You haven't published any offers yet.</p>
          ) : (
            (myListings.data ?? []).map((l) => (
              <div
                key={l.id}
                className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {l.side === "sell" ? "Selling" : "Buying"} {l.amount} {l.crypto_type}
                    </span>
                    <Badge variant={l.status === "active" ? "default" : "secondary"}>
                      {l.status}
                    </Badge>
                  </div>
                  <p className="mono text-xs text-muted-foreground">
                    ${Number(l.price).toLocaleString()} / {l.crypto_type} ·{" "}
                    {l.accepted_payment_methods.join(", ")}
                  </p>
                </div>
                <div className="flex gap-2">
                  {l.status === "active" ? (
                    <Button variant="outline" size="sm" onClick={() => setStatus(l.id, "paused")}>
                      Pause
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setStatus(l.id, "active")}>
                      Activate
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
