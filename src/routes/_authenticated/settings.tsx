import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Bell, Mail } from "lucide-react";
import {
  deletePushSubscription,
  getNotificationSettings,
  getVapidPublicKey,
  savePushSubscription,
  setEmailNotifications,
} from "@/lib/notification-settings.functions";
import { isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Notification settings — FOMN" },
      {
        name: "description",
        content: "Manage email and push notifications for trade activity on FOMN.",
      },
      { property: "og:title", content: "Notification settings — FOMN" },
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

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Choose how FOMN notifies you about trade activity.
        </p>
      </div>

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
