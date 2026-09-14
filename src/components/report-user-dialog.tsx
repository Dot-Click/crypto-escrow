import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { reportUser } from "@/lib/user-reports.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ReportUserDialog({
  open,
  onOpenChange,
  userId,
  displayName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  displayName: string;
}) {
  const [reason, setReason] = useState("");

  const reportFn = useServerFn(reportUser);
  const submit = useMutation({
    mutationFn: () => reportFn({ data: { userId, reason: reason.trim() } }),
    onSuccess: () => {
      toast.success("Report submitted — an admin will review it");
      setReason("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Report {displayName}</DialogTitle>
          <DialogDescription>Tell us what happened — an admin reviews every report by hand.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Describe the problem in at least 10 characters…"
          rows={4}
        />
        <DialogFooter>
          <Button
            disabled={submit.isPending || reason.trim().length < 10}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? "Submitting…" : "Submit report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
