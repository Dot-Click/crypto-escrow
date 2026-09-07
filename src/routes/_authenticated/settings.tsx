import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Bell, Mail, ShieldAlert } from "lucide-react";
import {
  deletePushSubscription,
  getNotificationSettings,
  getVapidPublicKey,
  savePushSubscription,
  setEmailNotifications,
} from "@/lib/notification-settings.functions";
import {
  getSecuritySettings,
  setLoginEmailVerification,
  setReleaseVerification,
  setWithdrawalVerification,
} from "@/lib/security-settings.functions";
import type { StepUpMethod } from "@/lib/security-types";
import { isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Notification settings — CEMP" },
      {
        name: "description",
        content: "Manage email and push notifications for trade activity on CEMP.",
      },
      { property: "og:title", content: "Notification settings — CEMP" },
      {
        property: "og:description",
        content: "Choose how you're notified about new trade messages and updates.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const [pushBusy, setPushBusy] = useState(false);

  const fetchSettings = useServerFn(getNotificationSettings);
  const settings = useQuery({
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notification-settings"] });
    },
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
      await qc.invalidateQueries({ queryKey: ["notification-settings"] });
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
      await qc.invalidateQueries({ queryKey: ["notification-settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't disable push notifications");
    } finally {
      setPushBusy(false);
    }
  };

  const pushSupported = isPushSupported();
  const pushConfigured = settings.data?.pushConfigured ?? false;
  const pushSubscribed = settings.data?.pushSubscribed ?? false;

  const fetchSecurity = useServerFn(getSecuritySettings);
  const security = useQuery({
    queryKey: ["security-settings"],
    queryFn: () => fetchSecurity(),
  });

  const setWithdrawalFn = useServerFn(setWithdrawalVerification);
  const withdrawalMutation = useMutation({
    mutationFn: (method: StepUpMethod) => setWithdrawalFn({ data: { method } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["security-settings"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const setReleaseFn = useServerFn(setReleaseVerification);
  const releaseMutation = useMutation({
    mutationFn: (method: StepUpMethod) => setReleaseFn({ data: { method } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["security-settings"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const setLoginEmailFn = useServerFn(setLoginEmailVerification);
  const loginEmailMutation = useMutation({
    mutationFn: (enabled: boolean) => setLoginEmailFn({ data: { enabled } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["security-settings"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const hasTotp = security.data?.hasTotp ?? false;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Choose how CEMP notifies you about trade activity.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            Require an extra code before withdrawing funds, releasing escrow, or signing in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {security.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium">Withdrawals</Label>
                  <p className="text-xs text-muted-foreground">
                    Confirm before sending funds to an external address.
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

              <div className="flex items-start justify-between gap-4 border-t border-border pt-6">
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

              <div className="flex items-start justify-between gap-4 border-t border-border pt-6">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 size-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="login-email-2fa" className="text-sm font-medium">
                      Sign-in
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {hasTotp ? (
                        "Protected by your authenticator app (2FA) — manage it on your Profile page."
                      ) : (
                        <>
                          Email a code at sign-in, or{" "}
                          <Link to="/profile" className="text-primary underline-offset-2 hover:underline">
                            set up an authenticator app
                          </Link>{" "}
                          instead.
                        </>
                      )}
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Applies to new trade messages, payment confirmations, and dispute updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {settings.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              {/* Email notifications */}
              <div className="flex items-start justify-between gap-4">
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
                  checked={settings.data?.emailNotifications ?? true}
                  disabled={emailMutation.isPending}
                  onCheckedChange={(checked) => emailMutation.mutate(checked)}
                />
              </div>

              <div className="border-t border-border pt-6">
                {/* Web push notifications */}
                <div className="flex items-start justify-between gap-4">
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
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
