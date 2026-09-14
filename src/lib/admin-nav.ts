import {
  ArrowDownToLine,
  ArrowLeftRight,
  BadgeCheck,
  Gavel,
  LayoutDashboard,
  MessageSquareText,
  Wallet as WalletIcon,
} from "lucide-react";

export const ADMIN_TABS = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "disputes", label: "Disputes", icon: Gavel },
  { value: "trades", label: "All trades", icon: ArrowLeftRight },
  { value: "deposits", label: "Deposits", icon: ArrowDownToLine },
  { value: "verification", label: "Verification", icon: BadgeCheck },
  { value: "feedback", label: "Feedback", icon: MessageSquareText },
  { value: "wallets", label: "Wallet addresses", icon: WalletIcon },
] as const;

export type AdminTabValue = (typeof ADMIN_TABS)[number]["value"];

export const ADMIN_TAB_VALUES = ADMIN_TABS.map((tab) => tab.value);
