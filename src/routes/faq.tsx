import { createFileRoute } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — CEMP" },
      { name: "description", content: "Common questions about escrow, wallets, deposits and disputes." },
    ],
  }),
  component: FaqPage,
});

const FAQS = [
  {
    q: "How does escrow actually work?",
    a: "When a buyer commits to a listing, the trade amount is moved out of the seller's free wallet balance into an internal escrow hold — a ledger entry, not a new blockchain transaction. It stays held until the seller confirms payment (releasing it to the buyer) or the trade is cancelled/disputed in the seller's favor (returning it to the seller).",
  },
  {
    q: "Where does my Lightning (BTC) deposit actually go?",
    a: "Lightning deposits are invoiced through a BTCPay Server store — the same self-custodied BTCPay instance the platform operator configures via BTCPAY_HOST/BTCPAY_STORE_ID. Paying the invoice sends sats straight into that store's own Lightning node wallet, which the operator controls — not a third-party custodian. Once the invoice settles, the app credits the equivalent amount to your in-app BTC wallet balance, same as an on-chain deposit. It's a completely separate system from the HD on-chain wallet: no shared addresses, no shared tables — it only feeds into the same BTC balance at the end.",
  },
  {
    q: "Why do I have a wallet if BTCPay is holding the actual coins?",
    a: "Your in-app wallet balance is your escrow-eligible balance on the platform — what you can lock into a trade or withdraw. BTCPay (for Lightning) and the HD deposit addresses (for on-chain coins) are just the two ways real crypto gets in or out; once it's in, it's tracked the same way regardless of which rail it arrived on.",
  },
  {
    q: "What happens if a trade goes wrong?",
    a: "Either party can raise a dispute any time before release. An admin reviews the trade room, chat history and any attached payment proof, then manually releases escrow to the buyer or returns it to the seller. There's no automated resolution — a person always looks at it.",
  },
  {
    q: "Is my identity document shared with anyone?",
    a: "No. A submitted ID goes into a private file store only you and the admin reviewing your request can open. It's never shown to other traders and isn't used for anything beyond that one review.",
  },
  {
    q: "What are withdrawal fees?",
    a: "No platform fee on withdrawals — you pay only the blockchain's own network fee to broadcast the transaction, shown before you confirm. See the fees page for the full breakdown.",
  },
  {
    q: "Is this real money?",
    a: "No — this is a testnet demo. No real funds move, there's no KYC requirement to use the base product, and prices/balances are for demonstration only.",
  },
];

function FaqPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Frequently asked questions</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Still stuck? Reach out from the{" "}
          <a href="/support" className="text-primary underline-offset-2 hover:underline">
            support page
          </a>
          .
        </p>
      </div>
      <Accordion type="single" collapsible className="rounded-lg border border-border bg-card px-2">
        {FAQS.map((item, i) => (
          <AccordionItem key={item.q} value={`item-${i}`}>
            <AccordionTrigger className="text-left text-sm font-medium">{item.q}</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">{item.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
