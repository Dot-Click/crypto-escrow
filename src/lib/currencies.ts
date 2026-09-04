export type Currency = { code: string; label: string; symbol: string; flag: string };

export const CURRENCIES: Currency[] = [
  { code: "USD", label: "US Dollar", symbol: "$", flag: "🇺🇸" },
  { code: "EUR", label: "Euro", symbol: "€", flag: "🇪🇺" },
  { code: "GBP", label: "British Pound", symbol: "£", flag: "🇬🇧" },
  { code: "NGN", label: "Nigerian Naira", symbol: "₦", flag: "🇳🇬" },
  { code: "KES", label: "Kenyan Shilling", symbol: "KSh", flag: "🇰🇪" },
  { code: "GHS", label: "Ghanaian Cedi", symbol: "₵", flag: "🇬🇭" },
  { code: "EGP", label: "Egyptian Pound", symbol: "E£", flag: "🇪🇬" },
  { code: "INR", label: "Indian Rupee", symbol: "₹", flag: "🇮🇳" },
  { code: "PKR", label: "Pakistani Rupee", symbol: "₨", flag: "🇵🇰" },
  { code: "BDT", label: "Bangladeshi Taka", symbol: "৳", flag: "🇧🇩" },
  { code: "ZAR", label: "South African Rand", symbol: "R", flag: "🇿🇦" },
  { code: "CAD", label: "Canadian Dollar", symbol: "CA$", flag: "🇨🇦" },
  { code: "AUD", label: "Australian Dollar", symbol: "AU$", flag: "🇦🇺" },
];

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}
