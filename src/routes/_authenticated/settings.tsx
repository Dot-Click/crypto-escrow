import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Bell, Copy, Mail, Send, ShieldAlert } from "lucide-react";
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
import {
  disconnectTelegram,
  generateTelegramLinkCode,
  getTelegramStatus,
  setTelegramNotifications,
} from "@/lib/telegram.functions";
import { isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
      void qc.invalidateQueries({ queryKey: ["telegram-status"] });
      toast.success("Telegram disconnected");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setTelegramNotifFn = useServerFn(setTelegramNotifications);
  const telegramNotifMutation = useMutation({
    mutationFn: (enabled: boolean) => setTelegramNotifFn({ data: { enabled } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["telegram-status"] }),
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

              <div className="border-t border-border pt-6">
                {/* Telegram notifications */}
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
        </CardContent>
      </Card>
    </div>
  );
}
