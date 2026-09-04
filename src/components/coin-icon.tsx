import { cn } from "@/lib/utils";

// Brand-colored circular glyphs so a crypto type reads at a glance instead
// of as plain text everywhere it appears (offer cards, wallet, trade room,
// transparency table, …). Colors match each coin's own brand mark.
const COIN_BG: Record<string, string> = {
  BTC: "#F7931A",
  ETH: "#627EEA",
  USDT: "#26A17B",
  LTC: "#345D9D",
};

export const COIN_FULL_NAME: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  USDT: "Tether",
  LTC: "Litecoin",
};

function Glyph({ code }: { code: string }) {
  switch (code) {
    case "BTC":
      return (
        <text x="12" y="16.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="white">
          ₿
        </text>
      );
    case "ETH":
      return (
        <g fill="white" fillOpacity="0.95">
          <path d="M12 3.5 L17.5 12 L12 15 L6.5 12 Z" fillOpacity="0.6" />
          <path d="M12 3.5 L17.5 12 L12 9.5 Z" />
          <path d="M12 16.2 L17.5 13.2 L12 20.5 L6.5 13.2 Z" fillOpacity="0.6" />
          <path d="M12 16.2 L17.5 13.2 L12 20.5 Z" />
        </g>
      );
    case "USDT":
      return (
        <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="700" fill="white">
          ₮
        </text>
      );
    case "LTC":
      return (
        <text x="12" y="16.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="white">
          Ł
        </text>
      );
    default:
      return (
        <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="700" fill="white">
          {code.slice(0, 1)}
        </text>
      );
  }
}

export function CoinIcon({ code, className }: { code: string; className?: string }) {
  const bg = COIN_BG[code] ?? "#6b7280";
  return (
    <svg viewBox="0 0 24 24" className={cn("shrink-0", className)} aria-label={COIN_FULL_NAME[code] ?? code}>
      <circle cx="12" cy="12" r="12" fill={bg} />
      <Glyph code={code} />
    </svg>
  );
}
