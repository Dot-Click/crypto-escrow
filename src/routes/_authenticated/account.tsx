import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  ChevronDown,
  Copy,
  CreditCard,
  Lock,
  Mail,
  MessageSquareText,
  Send,
  ShieldAlert,
  Tag,
  Upload,
  User as UserIcon,
  X,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { RAIL_DETAIL_FIELDS, summarizeDetails } from "@/lib/payment-method-fields";
import { railKeyForMethod } from "@/lib/payment-taxonomy";
import { COUNTRIES } from "@/lib/countries";
import { closeAccount } from "@/lib/account.functions";
import { uploadAvatar } from "@/lib/avatar";
import {
  getNotificationSettings,
  getVapidPublicKey,
  savePushSubscription,
  deletePushSubscription,
  setEmailNotifications,
} from "@/lib/notification-settings.functions";
import {
  getSecuritySettings,
  setLoginEmailVerification,
  setReleaseVerification,
  setWithdrawalVerification,
} from "@/lib/security-settings.functions";
import type { StepUpMethod } from "@/lib/security-types";
import {
  disconnectTelegram,
  generateTelegramLinkCode,
  getTelegramStatus,
  setTelegramNotifications,
} from "@/lib/telegram.functions";
import { isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";
import { PaymentMethodPicker } from "@/components/payment-method-picker";
import { TraderLevelBadge } from "@/components/trader-level-badge";
import { UserAvatar } from "@/components/user-avatar";
import { TwoFactorSettings } from "@/components/two-factor-settings";
import { PaymentRailIcon } from "@/components/payment-rail-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
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

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Account settings — CEMP" },
      {
        name: "description",
        content: "Manage your CEMP account: profile, security, payment methods and notifications.",
      },
    ],
  }),
  component: AccountPage,
});

type MenuKey = "profile" | "security" | "payments" | "notifications" | "verification" | "feedback" | "danger";

function MenuRow({
  icon: Icon,
  title,
  subtitle,
  open,
  onToggle,
  destructive,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
      >
        <span
          className={
            destructive
              ? "flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
              : "flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
          }
        >
          <Icon className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={destructive ? "block text-sm font-medium text-destructive" : "block text-sm font-medium"}>
            {title}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
        <ChevronDown
          className={
            open
              ? "size-4 shrink-0 rotate-180 text-muted-foreground transition-transform"
              : "size-4 shrink-0 text-muted-foreground transition-transform"
          }
        />
      </button>
      {open ? <div className="space-y-4 border-t border-border bg-muted/20 px-4 py-4">{children}</div> : null}
    </div>
  );
}

function LinkRow({
  icon: Icon,
  title,
  subtitle,
  to,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </Link>
  );
}

function AccountPage() {
  const { user, profile, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const avatarInput = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"buyer" | "seller" | "both">("both");
  const [country, setCountry] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);

  const [openSection, setOpenSection] = useState<MenuKey | null>(null);
  const toggleSection = (key: MenuKey) => setOpenSection((cur) => (cur === key ? null : key));

  const myBio = useQuery({
    queryKey: ["my-bio", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("bio").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data?.bio ?? "";
    },
  });

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setRole(profile.role);
      setCountry(profile.country ?? "");
    }
  }, [profile]);

  useEffect(() => {
    if (myBio.data != null) setBio(myBio.data);
  }, [myBio.data]);

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
    if (!country) {
      toast.error("Select your country before saving");
      return;
    }
    if (bio.length > 500) {
      toast.error("Bio must be 500 characters or fewer");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName, role, country: country || null, bio: bio.trim() || null })
      .eq("id", user.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshProfile();
    await queryClient.invalidateQueries({ queryKey: ["my-bio", user.id] });
    await queryClient.invalidateQueries({ queryKey: ["trader-profile", user.id] });
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

  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  const submitFeedback = async () => {
    if (!user) return;
    const message = feedbackMessage.trim();
    if (message.length < 5) {
      toast.error("Tell us a bit more — at least 5 characters");
      return;
    }
    setFeedbackBusy(true);
    const { error } = await supabase
      .from("feedback")
      .insert({ user_id: user.id, message, page_path: window.location.pathname });
    setFeedbackBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setFeedbackMessage("");
    toast.success("Thanks — your feedback was sent");
  };

  const verificationInput = useRef<HTMLInputElement>(null);
  const [verificationBusy, setVerificationBusy] = useState(false);

  const myVerificationRequest = useQuery({
    queryKey: ["my-verification-request", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("verification_requests")
        .select("id, status, note, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const submitVerification = async (file: File | undefined) => {
    if (!file || !user) return;
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) {
      toast.error("Use a JPEG, PNG, WebP image or a PDF");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("File must be 8 MB or smaller");
      return;
    }
    setVerificationBusy(true);
    try {
      const path = `${user.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("verification-docs")
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (uploadError) throw new Error(uploadError.message);

      const { error: insertError } = await supabase
        .from("verification_requests")
        .insert({ user_id: user.id, document_path: path });
      if (insertError) throw new Error(insertError.message);

      await queryClient.invalidateQueries({ queryKey: ["my-verification-request", user.id] });
      toast.success("ID submitted — an admin will review it shortly");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't submit your ID");
    } finally {
      setVerificationBusy(false);
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

  // --- Notifications (formerly /settings) ---
  const [pushBusy, setPushBusy] = useState(false);

  const fetchSettings = useServerFn(getNotificationSettings);
  const notifSettings = useQuery({
    queryKey: ["notification-settings"],
    queryFn: () => fetchSettings(),
  });

  const fetchVapidKey = useServerFn(getVapidPublicKey);
  const vapidKey = useQuery({
    queryKey: ["vapid-public-key"],
    queryFn: () => fetchVapidKey(),
    staleTime: Infinity,
  });

  const setEmailFn = useServerFn(setEmailNotifications);
  const emailMutation = useMutation({
    mutationFn: (enabled: boolean) => setEmailFn({ data: { enabled } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notification-settings"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const fetchTelegram = useServerFn(getTelegramStatus);
  const telegram = useQuery({
    queryKey: ["telegram-status"],
    queryFn: () => fetchTelegram(),
  });

  const [linkCode, setLinkCode] = useState<string | null>(null);
  const generateLinkFn = useServerFn(generateTelegramLinkCode);
  const generateLinkMutation = useMutation({
    mutationFn: () => generateLinkFn(),
    onSuccess: (res) => setLinkCode(res.code),
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectTelegramFn = useServerFn(disconnectTelegram);
  const disconnectMutation = useMutation({
    mutationFn: () => disconnectTelegramFn(),
    onSuccess: () => {
      setLinkCode(null);
      void queryClient.invalidateQueries({ queryKey: ["telegram-status"] });
      toast.success("Telegram disconnected");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setTelegramNotifFn = useServerFn(setTelegramNotifications);
  const telegramNotifMutation = useMutation({
    mutationFn: (enabled: boolean) => setTelegramNotifFn({ data: { enabled } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["telegram-status"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSubFn = useServerFn(savePushSubscription);
  const deleteSubFn = useServerFn(deletePushSubscription);

  const enablePush = async () => {
    const publicKey = vapidKey.data?.publicKey;
    if (!publicKey) {
      toast.error("Push notifications aren't configured on this server yet.");
      return;
    }
    setPushBusy(true);
    try {
      const sub = await subscribeToPush(publicKey);
      await saveSubFn({ data: sub });
      toast.success("Push notifications enabled");
      await queryClient.invalidateQueries({ queryKey: ["notification-settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't enable push notifications");
    } finally {
      setPushBusy(false);
    }
  };

  const disablePush = async () => {
    setPushBusy(true);
    try {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) await deleteSubFn({ data: { endpoint } });
      toast.success("Push notifications disabled");
      await queryClient.invalidateQueries({ queryKey: ["notification-settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't disable push notifications");
    } finally {
      setPushBusy(false);
    }
  };

  const pushSupported = isPushSupported();
  const pushConfigured = notifSettings.data?.pushConfigured ?? false;
  const pushSubscribed = notifSettings.data?.pushSubscribed ?? false;

  const fetchSecurity = useServerFn(getSecuritySettings);
  const security = useQuery({
    queryKey: ["security-settings"],
    queryFn: () => fetchSecurity(),
  });

  const setWithdrawalFn = useServerFn(setWithdrawalVerification);
  const withdrawalMutation = useMutation({
    mutationFn: (method: StepUpMethod) => setWithdrawalFn({ data: { method } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["security-settings"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const setReleaseFn = useServerFn(setReleaseVerification);
  const releaseMutation = useMutation({
    mutationFn: (method: StepUpMethod) => setReleaseFn({ data: { method } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["security-settings"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const setLoginEmailFn = useServerFn(setLoginEmailVerification);
  const loginEmailMutation = useMutation({
    mutationFn: (enabled: boolean) => setLoginEmailFn({ data: { enabled } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["security-settings"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const hasTotp = security.data?.hasTotp ?? false;

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-4 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Account settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, security, payments and notifications.</p>
      </div>

      <Card>
        <CardContent className="flex items-center gap-4 py-5">
          {user ? (
            <UserAvatar
              userId={user.id}
              displayName={profile?.display_name ?? "Trader"}
              cacheBust={avatarVersion}
              className="size-14 shrink-0 text-lg"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate font-semibold">
              {profile?.display_name ?? "Trader"}
              {profile?.is_verified ? <BadgeCheck className="size-4 shrink-0 text-primary" /> : null}
            </p>
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <TraderLevelBadge tradesCompleted={profile?.trades_completed ?? 0} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="divide-y divide-border">
          <MenuRow
            icon={UserIcon}
            title="Profile"
            subtitle="Display name, avatar, role, country, bio"
            open={openSection === "profile"}
            onToggle={() => toggleSection("profile")}
          >
            <div className="flex items-center gap-4">
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
              <div className="space-y-2">
                <Label>Country (required)</Label>
                {!country ? (
                  <p className="text-xs text-destructive">
                    Set your country — you can't create offers or trade until you do.
                  </p>
                ) : null}
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your country" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Your referral code</Label>
                <div className="flex gap-2">
                  <Input readOnly value={profile?.referral_code ?? ""} className="mono" />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!profile) return;
                      void navigator.clipboard.writeText(
                        `${window.location.origin}/auth?ref=${profile.referral_code}`,
                      );
                      toast.success("Invite link copied");
                    }}
                  >
                    Copy link
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share this link — anyone who signs up through it is linked to your account.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell other traders a bit about yourself…"
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">Shown on your public profile. {bio.length}/500</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>
                Completed trades: <span className="mono">{profile?.trades_completed ?? 0}</span>
              </span>
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
          </MenuRow>

          <MenuRow
            icon={Lock}
            title="Security"
            subtitle="Email, password, two-factor, withdrawal & release verification"
            open={openSection === "security"}
            onToggle={() => toggleSection("security")}
          >
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
            <div className="grid gap-4 border-b border-border pb-6 sm:grid-cols-2">
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
              <div className="sm:col-span-2">
                <Button onClick={changePassword} disabled={passwordBusy || !newPassword || !confirmPassword}>
                  {passwordBusy ? "Updating…" : "Change password"}
                </Button>
              </div>
            </div>

            <div className="border-b border-border pb-6">
              <Label className="text-sm font-medium">Two-factor authentication</Label>
              <p className="mb-3 text-xs text-muted-foreground">
                Require a code from an authenticator app in addition to your password.
              </p>
              <TwoFactorSettings />
            </div>

            {security.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4 border-b border-border pb-6">
                  <div>
                    <Label className="text-sm font-medium">Withdrawals</Label>
                    <p className="text-xs text-muted-foreground">
                      Confirm before sending funds to an external address or another trader.
                    </p>
                  </div>
                  <Select
                    value={security.data?.withdrawalVerification ?? "none"}
                    onValueChange={(v) => withdrawalMutation.mutate(v as StepUpMethod)}
                    disabled={withdrawalMutation.isPending}
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Without</SelectItem>
                      <SelectItem value="email">Email code</SelectItem>
                      <SelectItem value="totp" disabled={!hasTotp}>
                        2FA {hasTotp ? "" : "(enable first)"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-start justify-between gap-4 border-b border-border pb-6">
                  <div>
                    <Label className="text-sm font-medium">Escrow release</Label>
                    <p className="text-xs text-muted-foreground">
                      Confirm before releasing a trade's escrow to the buyer.
                    </p>
                  </div>
                  <Select
                    value={security.data?.releaseVerification ?? "none"}
                    onValueChange={(v) => releaseMutation.mutate(v as StepUpMethod)}
                    disabled={releaseMutation.isPending}
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Without</SelectItem>
                      <SelectItem value="email">Email code</SelectItem>
                      <SelectItem value="totp" disabled={!hasTotp}>
                        2FA {hasTotp ? "" : "(enable first)"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 size-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="login-email-2fa" className="text-sm font-medium">
                        Sign-in
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {hasTotp
                          ? "Protected by your authenticator app (2FA) above."
                          : "Email a code at sign-in, or set up an authenticator app above instead."}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="login-email-2fa"
                    checked={hasTotp ? true : (security.data?.loginEmailVerification ?? false)}
                    disabled={hasTotp || loginEmailMutation.isPending}
                    onCheckedChange={(checked) => loginEmailMutation.mutate(checked)}
                  />
                </div>
              </>
            )}
          </MenuRow>

          <MenuRow
            icon={CreditCard}
            title="Payment methods"
            subtitle="Saved details you attach to your offers"
            open={openSection === "payments"}
            onToggle={() => toggleSection("payments")}
          >
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
                      <Badge variant="outline" className="gap-1">
                        <PaymentRailIcon railKey={railKeyForMethod(pm.method)} className="size-3.5" />
                        {pm.method}
                      </Badge>
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
                    className="w-full justify-start gap-2"
                    onClick={() => setPickerOpen(true)}
                  >
                    {newMethod ? <PaymentRailIcon railKey={newRailKey} className="size-4" /> : null}
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
          </MenuRow>

          <LinkRow icon={Tag} title="Your offers" subtitle="Publish, pause, or edit your offers" to="/offers" />

          <MenuRow
            icon={Bell}
            title="Notifications"
            subtitle="Email, push and Telegram preferences"
            open={openSection === "notifications"}
            onToggle={() => toggleSection("notifications")}
          >
            {notifSettings.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4 border-b border-border pb-6">
                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5 size-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="email-notif" className="text-sm font-medium">
                        Email notifications
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Get an email when a trade partner sends you a message.
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="email-notif"
                    checked={notifSettings.data?.emailNotifications ?? true}
                    disabled={emailMutation.isPending}
                    onCheckedChange={(checked) => emailMutation.mutate(checked)}
                  />
                </div>

                <div className="flex items-start justify-between gap-4 border-b border-border pb-6">
                  <div className="flex items-start gap-3">
                    <Bell className="mt-0.5 size-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="push-notif" className="text-sm font-medium">
                        Web push notifications
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {!pushSupported
                          ? "Your browser doesn't support push notifications."
                          : !pushConfigured
                            ? "Not available on this deployment yet."
                            : "Get a browser notification when a trade partner sends you a message."}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="push-notif"
                    checked={pushSubscribed}
                    disabled={!pushSupported || !pushConfigured || pushBusy}
                    onCheckedChange={(checked) => (checked ? enablePush() : disablePush())}
                  />
                </div>

                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <Send className="mt-0.5 size-5 text-muted-foreground" />
                      <div>
                        <Label className="text-sm font-medium">Telegram notifications</Label>
                        <p className="text-xs text-muted-foreground">
                          {!telegram.data?.configured
                            ? "Not available on this deployment yet."
                            : telegram.data.linked
                              ? "Get a Telegram message when a trade partner sends you a message."
                              : "Connect a Telegram account to get trade updates there."}
                        </p>
                      </div>
                    </div>
                    {telegram.data?.linked ? (
                      <Switch
                        checked={telegram.data.notificationsEnabled}
                        disabled={telegramNotifMutation.isPending}
                        onCheckedChange={(checked) => telegramNotifMutation.mutate(checked)}
                      />
                    ) : null}
                  </div>

                  {telegram.data?.configured ? (
                    telegram.data.linked ? (
                      <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          Connected {telegram.data.linkedAt ? new Date(telegram.data.linkedAt).toLocaleDateString() : ""}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={disconnectMutation.isPending}
                          onClick={() => disconnectMutation.mutate()}
                        >
                          Disconnect
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {linkCode ? (
                          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                            <p className="text-xs text-muted-foreground">
                              Message this code to{" "}
                              {telegram.data.botUsername ? (
                                <a
                                  href={`https://t.me/${telegram.data.botUsername}?start=${linkCode}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary underline-offset-2 hover:underline"
                                >
                                  @{telegram.data.botUsername}
                                </a>
                              ) : (
                                "our bot"
                              )}{" "}
                              as <span className="mono">/start {linkCode}</span>:
                            </p>
                            <div className="flex items-center gap-2">
                              <code className="mono flex-1 rounded bg-background px-2 py-1 text-sm tracking-widest">
                                {linkCode}
                              </code>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  void navigator.clipboard.writeText(linkCode);
                                  toast.success("Code copied");
                                }}
                              >
                                <Copy className="size-3.5" />
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">Expires in 15 minutes.</p>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={generateLinkMutation.isPending}
                            onClick={() => generateLinkMutation.mutate()}
                          >
                            {generateLinkMutation.isPending ? "Generating…" : "Connect Telegram"}
                          </Button>
                        )}
                      </div>
                    )
                  ) : null}
                </div>
              </>
            )}
          </MenuRow>

          <MenuRow
            icon={BadgeCheck}
            title="Identity verification"
            subtitle={
              myVerificationRequest.data?.status === "approved"
                ? "Verified"
                : myVerificationRequest.data?.status === "pending"
                  ? "Submitted — awaiting review"
                  : myVerificationRequest.data?.status === "rejected"
                    ? "Submission rejected — try again"
                    : "Send your ID to an admin for manual review"
            }
            open={openSection === "verification"}
            onToggle={() => toggleSection("verification")}
          >
            {myVerificationRequest.data?.status === "approved" ? (
              <p className="flex items-center gap-1.5 text-sm text-primary">
                <BadgeCheck className="size-4" /> Your identity has been verified.
              </p>
            ) : (
              <>
                {myVerificationRequest.data?.status === "pending" ? (
                  <p className="text-sm text-muted-foreground">
                    Your ID is in the review queue. You'll see the result here once an admin checks it.
                  </p>
                ) : myVerificationRequest.data?.status === "rejected" ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    <p className="font-medium text-destructive">Not approved</p>
                    {myVerificationRequest.data?.note ? (
                      <p className="mt-1 text-muted-foreground">{myVerificationRequest.data.note}</p>
                    ) : null}
                    <p className="mt-1 text-muted-foreground">You can submit a new document below.</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Upload a photo of a government ID (passport, driver's license, national ID). An
                    admin reviews it manually — it's never shown to other traders.
                  </p>
                )}
                {myVerificationRequest.data?.status !== "pending" ? (
                  <div>
                    <input
                      ref={verificationInput}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      onChange={(e) => void submitVerification(e.target.files?.[0])}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={verificationBusy}
                      onClick={() => verificationInput.current?.click()}
                      className="gap-1.5"
                    >
                      <Upload className="size-4" />
                      {verificationBusy ? "Uploading…" : "Upload ID"}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </MenuRow>

          <MenuRow
            icon={MessageSquareText}
            title="Send feedback"
            subtitle="Tell us what's broken or missing"
            open={openSection === "feedback"}
            onToggle={() => toggleSection("feedback")}
          >
            <Textarea
              value={feedbackMessage}
              onChange={(e) => setFeedbackMessage(e.target.value)}
              placeholder="What's working, what isn't, what you'd like to see…"
              rows={3}
            />
            <Button size="sm" disabled={feedbackBusy || !feedbackMessage.trim()} onClick={submitFeedback}>
              {feedbackBusy ? "Sending…" : "Send feedback"}
            </Button>
          </MenuRow>

          <MenuRow
            icon={AlertTriangle}
            title="Danger zone"
            subtitle="Close your account"
            destructive
            open={openSection === "danger"}
            onToggle={() => toggleSection("danger")}
          >
            <p className="text-sm text-muted-foreground">
              Close your account once no trade is open and every wallet balance is withdrawn.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={closeAccountMutation.isPending}>
                  Close account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close your CEMP account?</AlertDialogTitle>
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
          </MenuRow>
        </div>
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
    </div>
  );
}
