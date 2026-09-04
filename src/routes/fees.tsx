import { createFileRoute } from "@tanstack/react-router";
import { PLATFORM_FEE_PERCENT } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/fees")({
  head: () => ({
    meta: [
      { title: "Fees — FOMN" },
      { name: "description", content: "What FOMN charges, who pays it, and when." },
    ],
  }),
  component: FeesPage,
});

const TRADING_FEES = [
  {
    fee: "Escrow fee",
    amount: `${PLATFORM_FEE_PERCENT}%`,
    notes:
      "Taken from the crypto amount when a trade releases. Shown in the buyer's receive amount before the trade opens — what you see is what you get.",
  },
  {
    fee: "Posting an offer",
    amount: "Free",
    notes: "Offers are free to post, edit and pause, however many you keep live.",
  },
  {
    fee: "Cancelled trades",
    amount: "Free",
    notes: "A trade that never completes is never charged. Escrow returns in full to the seller.",
  },
  {
    fee: "Disputes",
    amount: "Free",
    notes: "Opening a dispute costs nothing, whichever way an admin resolves it.",
  },
];

const WALLET_FEES = [
  { action: "Deposits", amount: "Free", notes: "We charge nothing to receive crypto." },
  {
    action: "Withdrawals",
    amount: "Network fee only",
    notes:
      "No platform fee — you pay only what the blockchain itself charges to broadcast the transaction. The exact fee is shown before you confirm.",
  },
  {
    action: "Sending crypto into escrow",
    amount: "Free",
    notes: "Opening a trade moves your wallet balance into escrow internally — it never touches a blockchain, so there's nothing to pay.",
  },
];

function FeesPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Fees</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          What FOMN charges, who pays it, and when. No listing fees, no monthly fees, and nothing
          charged for having an account.
        </p>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Trading
        </h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {TRADING_FEES.map((row) => (
                  <TableRow key={row.fee}>
                    <TableCell className="font-medium">{row.fee}</TableCell>
                    <TableCell className="mono whitespace-nowrap">{row.amount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.notes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Wallet
        </h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {WALLET_FEES.map((row) => (
                  <TableRow key={row.action}>
                    <TableCell className="font-medium">{row.action}</TableCell>
                    <TableCell className="mono whitespace-nowrap">{row.amount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.notes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <p className="text-xs text-muted-foreground">
        Live platform figures — reserves, liabilities and open disputes — are published on the{" "}
        <a href="/transparency" className="text-primary underline-offset-2 hover:underline">
          transparency page
        </a>
        . This is a testnet demo: figures above describe how the platform is actually wired today,
        not a finalized commercial fee schedule.
      </p>
    </div>
  );
}
