import { Landmark, Gift, Smartphone, Wallet, Banknote, CreditCard, Bitcoin, ShoppingBag, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const RAIL_ICONS: Record<string, LucideIcon> = {
  bank_transfer: Landmark,
  gift_card: Gift,
  mobile_money: Smartphone,
  online_wallet: Wallet,
  cash: Banknote,
  card: CreditCard,
  crypto: Bitcoin,
  goods_services: ShoppingBag,
};

export function PaymentRailIcon({ railKey, className }: { railKey: string | null; className?: string }) {
  const Icon = (railKey && RAIL_ICONS[railKey]) || Wallet;
  return <Icon className={cn("shrink-0", className)} aria-hidden />;
}
