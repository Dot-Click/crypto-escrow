export type Currency = { code: string; label: string; symbol: string };

export const CURRENCIES: Currency[] = [
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "NGN", label: "Nigerian Naira", symbol: "₦" },
  { code: "KES", label: "Kenyan Shilling", symbol: "KSh" },
  { code: "GHS", label: "Ghanaian Cedi", symbol: "₵" },
  { code: "EGP", label: "Egyptian Pound", symbol: "E£" },
  { code: "INR", label: "Indian Rupee", symbol: "₹" },
  { code: "PKR", label: "Pakistani Rupee", symbol: "₨" },
  { code: "BDT", label: "Bangladeshi Taka", symbol: "৳" },
  { code: "ZAR", label: "South African Rand", symbol: "R" },
  { code: "CAD", label: "Canadian Dollar", symbol: "CA$" },
  { code: "AUD", label: "Australian Dollar", symbol: "AU$" },
];

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}
