// Two-level payment-method taxonomy: a rail (category) with a list of
// specific providers under it. An accepted/saved method is identified by the
// string `${rail.label} · ${provider}` everywhere else in the app — no schema
// change needed, since accepted_payment_methods/payment_method/method were
// already plain text/text[] columns.
export type PaymentRail = {
  key: string;
  label: string;
  providers: string[];
};

export const PAYMENT_RAILS: PaymentRail[] = [
  {
    key: "bank_transfer",
    label: "Bank transfers",
    providers: [
      "Chase",
      "Bank of America",
      "Wells Fargo",
      "Citibank",
      "Capital One",
      "US Bank",
      "PNC Bank",
      "TD Bank",
      "RBC",
      "Scotiabank",
      "CIBC",
      "BMO",
      "HSBC",
      "Barclays",
      "Lloyds Bank",
      "NatWest",
      "Santander",
      "Deutsche Bank",
      "BNP Paribas",
      "Societe Generale",
      "ING",
      "UniCredit",
      "Intesa Sanpaolo",
      "Nordea",
      "SEB",
      "DNB",
      "ICICI Bank",
      "HDFC Bank",
      "State Bank of India",
      "Axis Bank",
      "Standard Chartered",
      "DBS Bank",
      "OCBC Bank",
      "Maybank",
      "ANZ",
      "Commonwealth Bank",
      "Westpac",
      "NAB",
      "First National Bank",
      "Absa",
      "Access Bank",
      "GTBank",
      "Zenith Bank",
      "Ecobank",
      "Bradesco",
      "Itau",
      "Banco de Chile",
      "Bancolombia",
      "BBVA",
      "Sberbank",
      "Other bank (name it in details)",
    ],
  },
  {
    key: "gift_card",
    label: "Gift cards",
    providers: [
      "Amazon",
      "Apple / iTunes",
      "Google Play",
      "Steam",
      "PlayStation",
      "Xbox",
      "Walmart",
      "Target",
      "Best Buy",
      "eBay",
      "Sephora",
      "Nike",
      "Adidas",
      "Netflix",
      "Spotify",
      "Uber",
      "Airbnb",
      "Visa Gift Card",
      "Mastercard Gift Card",
      "Vanilla Visa",
      "Razer Gold",
      "Nordstrom",
      "Home Depot",
      "Other gift card (name it in details)",
    ],
  },
  {
    key: "mobile_money",
    label: "Mobile money",
    providers: [
      "M-Pesa",
      "MTN Mobile Money",
      "Airtel Money",
      "Orange Money",
      "Tigo Pesa",
      "EcoCash",
      "Vodafone Cash",
      "GCash",
      "PayMaya",
      "bKash",
      "Nagad",
      "Paytm",
      "JazzCash",
      "Easypaisa",
      "Other mobile money (name it in details)",
    ],
  },
  {
    key: "online_wallet",
    label: "Online wallets",
    providers: [
      "PayPal",
      "Wise",
      "Revolut",
      "Skrill",
      "Neteller",
      "Payoneer",
      "Cash App",
      "Venmo",
      "Zelle",
      "Google Pay",
      "Apple Pay",
      "Alipay",
      "WeChat Pay",
      "Perfect Money",
      "AirTM",
      "Other wallet (name it in details)",
    ],
  },
  {
    key: "cash",
    label: "Cash",
    providers: ["Cash in person", "Cash by mail", "Cash deposit at bank", "Western Union", "MoneyGram"],
  },
  {
    key: "card",
    label: "Debit/Credit cards",
    providers: ["Visa", "Mastercard", "American Express", "Discover", "UnionPay"],
  },
  {
    key: "crypto",
    label: "Crypto",
    providers: [
      "Bitcoin (on-chain)",
      "Lightning Network",
      "Ethereum",
      "USDT (TRC20)",
      "USDT (ERC20)",
      "USDC",
      "Litecoin",
      "BNB",
      "Tron",
      "Solana",
    ],
  },
  {
    key: "asset",
    label: "Assets",
    providers: ["Stock/ETF transfer", "NFT transfer", "Domain name transfer", "Other asset (name it in details)"],
  },
];

export const METHOD_SEPARATOR = " · ";

export function methodString(railLabel: string, provider: string): string {
  return `${railLabel}${METHOD_SEPARATOR}${provider}`;
}

export function railKeyForMethod(method: string): string | null {
  const rail = PAYMENT_RAILS.find((r) => method.startsWith(`${r.label}${METHOD_SEPARATOR}`));
  return rail?.key ?? null;
}

export function railLabelForMethod(method: string): string {
  return method.split(METHOD_SEPARATOR)[0] ?? method;
}

export function providerForMethod(method: string): string {
  return method.split(METHOD_SEPARATOR).slice(1).join(METHOD_SEPARATOR) || method;
}

export const TOTAL_PROVIDER_COUNT = PAYMENT_RAILS.reduce((sum, r) => sum + r.providers.length, 0);
