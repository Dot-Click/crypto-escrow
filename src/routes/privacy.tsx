import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy policy — CEMP" },
      { name: "description", content: "What CEMP stores about you and why." },
    ],
  }),
  component: PrivacyPage,
});

const SECTIONS = [
  {
    title: "What we store",
    body: "Your account email, display name, avatar, country, saved payment method labels/details, wallet balances and deposit addresses, listings, trades, chat messages and payment proof attached to a trade, and any identity document you choose to submit for manual verification.",
  },
  {
    title: "Why we store it",
    body: "To run the marketplace and escrow itself — matching trades, holding balances, showing counterparties who they're trading with, resolving disputes, and (once you opt in) confirming your identity so other traders can see you're verified.",
  },
  {
    title: "Identity documents",
    body: "If you submit an ID for manual verification, it's stored in a private file store that only you and an admin reviewing your request can access — it's never shown to other traders, never used for anything beyond that one review, and you can ask for it to be deleted once the review is done.",
  },
  {
    title: "Who can see what",
    body: "Other traders see your display name, avatar, country, trade count, and verification badge — never your email, payment method details, or ID documents. Trade chat and payment proof are visible only to the two parties in that trade, plus an admin if a dispute is opened.",
  },
  {
    title: "Third parties",
    body: "Deposit/withdrawal broadcasting and confirmation checks call out to public blockchain explorers (Etherscan, Tronscan, BlockCypher) and payment providers (NOWPayments, BTCPay) — only the minimum transaction data needed to verify a deposit or send a payout is shared with them. Email notifications go through Resend; nothing beyond the notification content itself is shared with them.",
  },
  {
    title: "Your choices",
    body: "You can update or remove your profile details, payment methods and avatar at any time from your profile page, and close your account entirely once every trade is settled and every wallet balance is withdrawn.",
  },
];

function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Testnet demo — this describes how the platform is actually wired today, not a finalized
          legal policy.
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
