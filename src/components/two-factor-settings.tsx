import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/**
 * Uses Supabase Auth's built-in TOTP MFA (enroll/challenge/verify/unenroll)
 * rather than a hand-rolled TOTP implementation — GoTrue generates and
 * stores the secret, and issues the QR code as ready-to-render SVG markup.
 */
export function TwoFactorSettings() {
  const qc = useQueryClient();
  const [enrolling, setEnrolling] = useState<{ factorId: string; qrSvg: string; secret: string } | null>(
    null,
  );
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const factors = useQuery({
    queryKey: ["mfa-factors"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw new Error(error.message);
      return data.totp.filter((f) => f.status === "verified");
    },
  });

  const startEnroll = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (data) => {
      setEnrolling({ factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmEnroll = useMutation({
    mutationFn: async () => {
      if (!enrolling) throw new Error("Start enrollment first");
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: enrolling.factorId,
      });
      if (challengeError) throw new Error(challengeError.message);
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrolling.factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw new Error(verifyError.message);
    },
    onSuccess: async () => {
      toast.success("Two-factor authentication enabled");
      setEnrolling(null);
      setCode("");
      await qc.invalidateQueries({ queryKey: ["mfa-factors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelEnroll = async () => {
    if (enrolling) await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId });
    setEnrolling(null);
    setCode("");
  };

  const disable = useMutation({
    mutationFn: async (factorId: string) => {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Two-factor authentication disabled");
      await qc.invalidateQueries({ queryKey: ["mfa-factors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeFactor = factors.data?.[0] ?? null;

  if (factors.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (enrolling) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Scan this QR code with an authenticator app (Google Authenticator, 1Password, Authy),
          then enter the 6-digit code it shows.
        </p>
        <div
          className="w-fit rounded-md border border-border bg-white p-3"
          // Trusted content — this SVG comes directly from Supabase's own MFA enroll response, not user input.
          dangerouslySetInnerHTML={{ __html: enrolling.qrSvg }}
        />
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Can't scan? Enter this key manually</Label>
          <p className="mono text-xs break-all">{enrolling.secret}</p>
        </div>
        <div className="max-w-40 space-y-2">
          <Label htmlFor="mfa-code">6-digit code</Label>
          <Input
            id="mfa-code"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            className="mono tracking-widest"
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => confirmEnroll.mutate()}
            disabled={confirmEnroll.isPending || code.length !== 6}
          >
            {confirmEnroll.isPending ? "Verifying…" : "Verify and enable"}
          </Button>
          <Button variant="outline" onClick={cancelEnroll} disabled={confirmEnroll.isPending}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (activeFactor) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm">
          <ShieldCheck className="size-4 text-green-600" />
          <span>Two-factor authentication is on.</span>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={disable.isPending}>
              Disable
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Turn off two-factor authentication?</AlertDialogTitle>
              <AlertDialogDescription>
                Your account will only need your password to sign in. This is the single most
                effective thing you can do to protect your funds — think twice before turning it
                off.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => disable.mutate(activeFactor.id)}
              >
                Disable
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldOff className="size-4" />
        <span>Two-factor authentication is off.</span>
      </div>
      <Button variant="outline" size="sm" onClick={() => startEnroll.mutate()} disabled={startEnroll.isPending}>
        {startEnroll.isPending ? "Starting…" : "Enable 2FA"}
      </Button>
    </div>
  );
}
