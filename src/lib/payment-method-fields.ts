export type PaymentDetailField = { key: string; label: string; placeholder?: string; optional?: boolean };

/**
 * Which structured fields to collect for a saved payment method, keyed by
 * rail (not by the specific provider) — a Chase account and a Wells Fargo
 * account need the same shape of details, just different values.
 */
export const RAIL_DETAIL_FIELDS: Record<string, PaymentDetailField[]> = {
  bank_transfer: [
    { key: "account_holder_name", label: "Account holder name", placeholder: "Jane Doe" },
    { key: "account_number", label: "Account number or IBAN", placeholder: "GB29 NWBK 6016 1331 9268 19" },
    { key: "routing_code", label: "Routing / SWIFT / sort code", placeholder: "021000021", optional: true },
  ],
  gift_card: [
    { key: "instructions", label: "Redemption instructions", placeholder: "Send the code + receipt photo", optional: true },
  ],
  mobile_money: [
    { key: "phone_number", label: "Phone number", placeholder: "+254 700 000000" },
    { key: "account_name", label: "Registered account name", placeholder: "Jane Doe", optional: true },
  ],
  online_wallet: [{ key: "handle", label: "Email, username, or handle", placeholder: "jane@example.com" }],
  cash: [{ key: "location", label: "Meeting location / instructions", placeholder: "Starbucks on 5th & Main, weekday afternoons" }],
  card: [{ key: "instructions", label: "Payment link or instructions", placeholder: "Stripe checkout link, accepted card types", optional: true }],
  crypto: [
    { key: "wallet_address", label: "Wallet address", placeholder: "bc1q…" },
    { key: "network_note", label: "Network / memo note", placeholder: "TRC20, memo 12345", optional: true },
  ],
  goods_services: [
    { key: "instructions", label: "Transfer instructions", placeholder: "Broker, account, or contact details" },
  ],
};

export function summarizeDetails(railKey: string, details: Record<string, string>): string {
  const fields = RAIL_DETAIL_FIELDS[railKey] ?? [];
  const primary = fields[0];
  if (!primary) return "";
  const value = details[primary.key];
  if (!value) return "";
  return value.length > 28 ? `${value.slice(0, 28)}…` : value;
}
