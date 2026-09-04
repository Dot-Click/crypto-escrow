export type Currency = { code: string; label: string; symbol: string; flagCode: string };

// flagCode is an ISO 3166-1 alpha-2 code (lowercase) for the "flag-icons"
// package's `fi fi-<code>` class — real SVG flags, not Unicode emoji, since
// Windows renders flag emoji as plain two-letter codes with no color.
export const CURRENCIES: Currency[] = [
  { code: "USD", label: "US Dollar", symbol: "$", flagCode: "us" },
  { code: "EUR", label: "Euro", symbol: "€", flagCode: "eu" },
  { code: "GBP", label: "British Pound", symbol: "£", flagCode: "gb" },
  { code: "NGN", label: "Nigerian Naira", symbol: "₦", flagCode: "ng" },
  { code: "KES", label: "Kenyan Shilling", symbol: "KSh", flagCode: "ke" },
  { code: "GHS", label: "Ghanaian Cedi", symbol: "₵", flagCode: "gh" },
  { code: "EGP", label: "Egyptian Pound", symbol: "E£", flagCode: "eg" },
  { code: "INR", label: "Indian Rupee", symbol: "₹", flagCode: "in" },
  { code: "PKR", label: "Pakistani Rupee", symbol: "₨", flagCode: "pk" },
  { code: "BDT", label: "Bangladeshi Taka", symbol: "৳", flagCode: "bd" },
  { code: "ZAR", label: "South African Rand", symbol: "R", flagCode: "za" },
  { code: "CAD", label: "Canadian Dollar", symbol: "CA$", flagCode: "ca" },
  { code: "AUD", label: "Australian Dollar", symbol: "AU$", flagCode: "au" },
];

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}
