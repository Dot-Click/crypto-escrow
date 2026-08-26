// NOWPayments (sandbox/testnet) helpers. Server-only.
import { createHmac, timingSafeEqual } from "crypto";

const SANDBOX_BASE = "https://api-sandbox.nowpayments.io/v1";
const PRODUCTION_BASE = "https://api.nowpayments.io/v1";

/** Defaults to sandbox; set NOWPAYMENTS_ENV=production to hit the live API. */
function npBase(): string {
  if (process.env["NOWPAYMENTS_API_BASE"]) return process.env["NOWPAYMENTS_API_BASE"];
  return process.env["NOWPAYMENTS_ENV"] === "production" ? PRODUCTION_BASE : SANDBOX_BASE;
}

export function npApiKey(): string | undefined {
  return process.env["NOWPAYMENTS_API_KEY"] || undefined;
}

export function npIpnSecret(): string | undefined {
  return process.env["NOWPAYMENTS_IPN_SECRET"] || undefined;
}

/** Deterministic key ordering, as required by NOWPayments IPN signing. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function verifyIpnSignature(rawBody: string, signature: string | null): boolean {
  const secret = npIpnSecret();
  if (!secret || !signature) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return false;
  }
  const expected = createHmac("sha512", secret).update(stableStringify(parsed)).digest("hex");
  const a = Buffer.from(signature.trim().toLowerCase());
  const b = Buffer.from(expected.toLowerCase());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type PayoutResult = { providerPayoutId: string | null; simulated: boolean };

export async function createPayout(params: {
  cryptoType: string;
  amount: number;
  address: string;
}): Promise<PayoutResult> {
  const key = npApiKey();
  const email = process.env["NOWPAYMENTS_EMAIL"];
  const password = process.env["NOWPAYMENTS_PASSWORD"];
  if (!key || !email || !password) {
    // No payout credentials: the request stays pending for manual processing.
    return { providerPayoutId: null, simulated: true };
  }

  const authRes = await fetch(`${npBase()}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(12_000),
    body: JSON.stringify({ email, password }),
  });
  if (!authRes.ok) throw new Error("Provider authentication failed");
  const { token } = (await authRes.json()) as { token?: string };
  if (!token) throw new Error("Provider authentication failed");

  const res = await fetch(`${npBase()}/payout`, {
    method: "POST",
    headers: {
      "x-api-key": key,
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(12_000),
    body: JSON.stringify({
      ipn_callback_url: process.env["NOWPAYMENTS_PAYOUT_CALLBACK_URL"] ?? undefined,
      withdrawals: [
        {
          address: params.address,
          currency: params.cryptoType.toLowerCase(),
          amount: params.amount,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Provider rejected the withdrawal (${res.status})`);
  const json = (await res.json()) as { id?: string | number };
  return { providerPayoutId: json.id ? String(json.id) : null, simulated: false };
}
