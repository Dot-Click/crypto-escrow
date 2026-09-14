// Send crypto directly to another trader's wallet — an internal ledger move,
// no on-chain transaction. Modeled on swap-dialog.tsx's layout, but the coin
// is the only choice (recipient and direction are both fixed by which
// profile this was opened from).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getWalletOverview } from "@/lib/wallet.functions";
import { sendCrypto } from "@/lib/send-crypto.functions";
import { CRYPTO_TYPES } from "@/lib/constants";
import { CoinIcon } from "@/components/coin-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function SendCryptoDialog({
  open,
  onOpenChange,
  recipientUserId,
  recipientDisplayName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientUserId: string;
  recipientDisplayName: string;
}) {
  const qc = useQueryClient();
  const [cryptoType, setCryptoType] = useState("BTC");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [stepUpCode, setStepUpCode] = useState("");

  useEffect(() => {
    if (!open) return;
    setCryptoType("BTC");
    setAmount("");
    setNote("");
    setStepUpCode("");
  }, [open]);

  const fetchWallet = useServerFn(getWalletOverview);
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => fetchWallet(), enabled: open });
  const balance = wallet.data?.wallets.find((w) => w.crypto_type === cryptoType)?.balance ?? 0;

  const sendFn = useServerFn(sendCrypto);
  const amountNum = Number(amount);
  const doSend = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          recipientUserId,
          cryptoType,
          amount: amountNum,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(stepUpCode.trim() ? { stepUpCode: stepUpCode.trim() } : {}),
        },
      }),
    onSuccess: () => {
      toast.success(`Sent ${amountNum} ${cryptoType} to ${recipientDisplayName}`);
      void qc.invalidateQueries({ queryKey: ["wallet"] });
      void qc.invalidateQueries({ queryKey: ["wallet-overview"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const insufficientBalance = amountNum > 0 && amountNum > balance;
  const canSend = amountNum > 0 && !insufficientBalance;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send crypto</DialogTitle>
          <DialogDescription>Send directly to {recipientDisplayName}'s wallet — instant, no network fee.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Coin</Label>
              <span className="text-xs text-muted-foreground">
                Balance: {balance.toFixed(8)} {cryptoType}
              </span>
            </div>
            <div className="flex gap-2">
              <Select value={cryptoType} onValueChange={setCryptoType}>
                <SelectTrigger className="w-36 shrink-0">
                  <span className="flex items-center gap-2">
                    <CoinIcon code={cryptoType} className="size-4" />
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {CRYPTO_TYPES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      <span className="flex items-center gap-2">
                        <CoinIcon code={c.code} className="size-4" />
                        {c.code}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-xs"
                onClick={() => setAmount(String(balance))}
              >
                MAX
              </Button>
            </div>
            {insufficientBalance ? (
              <p className="text-xs text-destructive">Not enough {cryptoType} available.</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="send-note">Note (optional)</Label>
            <Input
              id="send-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What's this for?"
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="send-step-up">Verification code</Label>
            <Input
              id="send-step-up"
              value={stepUpCode}
              onChange={(e) => setStepUpCode(e.target.value)}
              placeholder="If your account requires one"
            />
          </div>

          <Button className="w-full" disabled={!canSend || doSend.isPending} onClick={() => doSend.mutate()}>
            {doSend.isPending ? "Sending…" : `Send ${cryptoType}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
