import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { RAIL_DETAIL_FIELDS, summarizeDetails } from "@/lib/payment-method-fields";
import { railKeyForMethod } from "@/lib/payment-taxonomy";
import { closeAccount } from "@/lib/account.functions";
import { uploadAvatar } from "@/lib/avatar";
import { PaymentMethodPicker } from "@/components/payment-method-picker";
import { TraderLevelBadge } from "@/components/trader-level-badge";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
      { title: "Your profile — FOMN" },
      {
        name: "description",
        content: "Manage your FOMN trader profile, display name, trading role and offers.",
      },
      { property: "og:title", content: "Your profile — FOMN" },
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
  const navigate = useNavigate();
  const avatarInput = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"buyer" | "seller" | "both">("both");
  const [busy, setBusy] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);

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

  const changePassword = async () => {
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    setPasswordBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password updated");
  };

  const changeEmail = async () => {
    const trimmed = newEmail.trim();
    if (!trimmed || !trimmed.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    setEmailBusy(true);
    const { error } = await supabase.auth.updateUser({ email: trimmed });
    setEmailBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewEmail("");
    toast.success(`Confirmation links sent to ${user?.email} and ${trimmed} — click both to finish the change.`);
  };

  const handleAvatarUpload = async (file: File | undefined) => {
    if (!file || !user) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Use a JPEG, PNG, or WebP image");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be 2 MB or smaller");
      return;
    }
    setAvatarBusy(true);
    try {
      await uploadAvatar(user.id, file);
      setAvatarVersion(Date.now());
      toast.success("Avatar updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't upload avatar");
    } finally {
      setAvatarBusy(false);
    }
  };

  const closeAccountFn = useServerFn(closeAccount);
  const closeAccountMutation = useMutation({
    mutationFn: () => closeAccountFn(),
    onSuccess: async () => {
      toast.success("Account closed");
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
          <div className="flex items-center gap-4">
            {user ? (
              <UserAvatar
                userId={user.id}
                displayName={profile?.display_name ?? "Trader"}
                cacheBust={avatarVersion}
                className="size-16 shrink-0 text-xl"
              />
            ) : null}
            <div className="space-y-1">
              <input
                ref={avatarInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => void handleAvatarUpload(e.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={avatarBusy}
                onClick={() => avatarInput.current?.click()}
              >
                {avatarBusy ? "Uploading…" : "Change photo"}
              </Button>
              <p className="text-xs text-muted-foreground">JPEG, PNG or WebP, up to 2 MB.</p>
            </div>
          </div>
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
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              Completed trades: <span className="mono">{profile?.trades_completed ?? 0}</span>
            </span>
            <TraderLevelBadge tradesCompleted={profile?.trades_completed ?? 0} />
            {user ? (
              <Link
                to="/traders/$userId"
                params={{ userId: user.id }}
                className="text-primary underline-offset-2 hover:underline"
              >
                View your public profile
              </Link>
            ) : null}
          </div>
          <Button onClick={save} disabled={busy}>
            Save changes
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Change the email or password used to sign in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 border-b border-border pb-6">
            <Label htmlFor="new-email">Email address</Label>
            <p className="text-xs text-muted-foreground">Current: {user?.email}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="new@example.com"
                className="sm:max-w-xs"
              />
              <Button variant="outline" onClick={changeEmail} disabled={emailBusy || !newEmail.trim()}>
                {emailBusy ? "Sending…" : "Change email"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              We'll email confirmation links to both your current and new address — the change takes
              effect once you click both.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <Button onClick={changePassword} disabled={passwordBusy || !newPassword || !confirmPassword}>
            {passwordBusy ? "Updating…" : "Change password"}
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

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Close your account once no trade is open and every wallet balance is withdrawn.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={closeAccountMutation.isPending}>
                Close account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Close your FOMN account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This signs you out and blocks future logins. It only works with no open trade and
                  every wallet balance at zero — withdraw first if you haven't. This can't be undone
                  from the app.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => closeAccountMutation.mutate()}
                >
                  Close account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
