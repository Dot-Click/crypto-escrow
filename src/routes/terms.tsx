import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of service — CEMP" },
      { name: "description", content: "The rules for using the CEMP testnet P2P marketplace." },
    ],
  }),
  component: TermsPage,
});

const SECTIONS = [
  {
    title: "1. What CEMP is",
    body: "CEMP is a peer-to-peer marketplace for trading crypto for fiat. It is currently running in testnet mode: no real funds move through the platform, there is no KYC, and nothing here should be treated as a finished commercial product.",
  },
  {
    title: "2. Escrow",
    body: "When a buyer commits to a listing, the trade amount is locked from the seller's wallet balance into escrow — an internal ledger hold, not a separate blockchain transaction. Escrow is released to the buyer once the seller confirms payment, or returned to the seller if the trade is cancelled or a dispute is resolved in their favor.",
  },
  {
    title: "3. Disputes",
    body: "Either party can raise a dispute on an open trade before funds are released. An admin reviews the trade room, chat, and any attached payment proof, then manually releases escrow to the buyer or returns it to the seller. There is no automated dispute resolution.",
  },
  {
    title: "4. Off-platform payment",
    body: "Fiat payment for a trade happens outside CEMP, through the payment method the two parties agreed on. CEMP never holds or moves fiat currency and is not a party to that payment.",
  },
  {
    title: "5. Account responsibilities",
    body: "You're responsible for the accuracy of your listings, the payment details you share, and for keeping your account secure (use two-factor authentication where offered). Don't use the platform for anything illegal, and don't try to move a trade's negotiation or payment proof off-platform in a way that removes the record from the trade room.",
  },
  {
    title: "6. No investment advice",
    body: "Nothing on CEMP is financial or investment advice. Prices shown are informational and can move between when you see them and when a trade completes.",
  },
  {
    title: "7. Changes",
    body: "Since this is an actively developed testnet demo, these terms and the underlying product can change without notice.",
  },
];

function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Terms of service</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Testnet demo — no real funds, no KYC, no automated dispute resolution. Read this alongside
          the <a href="/privacy" className="text-primary underline-offset-2 hover:underline">privacy policy</a> and{" "}
          <a href="/fees" className="text-primary underline-offset-2 hover:underline">fees page</a>.
        </p>
      </div>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {SECTIONS.map((s) => (
            <section key={s.title} className="p-5">
              <h2 className="mb-2 text-sm font-semibold">{s.title}</h2>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </section>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
