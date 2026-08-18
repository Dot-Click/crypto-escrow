import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
