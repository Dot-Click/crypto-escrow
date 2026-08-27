// Client-facing entry points for Tier B deposit-address verification: a user
// proves control of the address they're about to send from by signing a
// server-issued challenge message, before we'll ever credit a deposit that
// arrives from it. See address-signature.server.ts and
// deposit-verification.server.ts for the crediting-side half of this.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CHALLENGE_TTL_MINUTES = 15;

export const requestAddressChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cryptoType: string; network: string; address: string }) => {
    const address = String(input.address ?? "").trim();
    if (address.length < 10 || address.length > 120) throw new Error("Enter a valid address");
    const network = String(input.network ?? "").trim();
    if (!network) throw new Error("Network is required");
    const cryptoType = String(input.cryptoType ?? "").trim().toUpperCase();
    if (!cryptoType) throw new Error("Coin is required");
    return { cryptoType, network, address };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    const { isSignatureNetwork } = await import("@/lib/address-signature.server");

    if (!isSignatureNetwork(data.network)) {
      throw new Error("This network doesn't support address verification");
    }

    await enforceRateLimit({
      userId: context.userId,
      action: "deposit_address_challenge",
      limit: 20,
      windowSeconds: 3600,
    });

    const address = data.address.toLowerCase();

    const { data: existingBinding } = await supabaseAdmin
      .from("deposit_source_addresses")
      .select("user_id")
      .eq("network", data.network)
      .eq("address", address)
      .maybeSingle();
    if (existingBinding && existingBinding.user_id !== context.userId) {
      throw new Error("This address is already registered to another account");
    }

    const nonce = crypto.randomUUID();
    const message = [
      "FOMN deposit address verification",
      `User: ${context.userId}`,
      `Network: ${data.network}`,
      `Address: ${data.address}`,
      `Nonce: ${nonce}`,
      "Sign this exact message with the wallet you'll deposit from to prove you control it.",
    ].join("\n");
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60_000).toISOString();

    const { data: challenge, error } = await supabaseAdmin
      .from("deposit_address_challenges")
      .insert({
        user_id: context.userId,
        crypto_type: data.cryptoType,
        network: data.network,
        address: data.address,
        nonce,
        message,
        expires_at: expiresAt,
      })
      .select("id, message, expires_at")
      .single();
    if (error) throw new Error(error.message);

    return challenge;
  });

export const submitAddressSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { challengeId: string; signature: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.challengeId)) throw new Error("Invalid challenge id");
    const signature = String(input.signature ?? "").trim();
    if (!signature) throw new Error("Paste the signature you generated");
    return { challengeId: input.challengeId, signature };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    const { verifyAddressSignature, isSignatureNetwork } = await import("@/lib/address-signature.server");

    await enforceRateLimit({
      userId: context.userId,
      action: "deposit_address_verify",
      limit: 20,
      windowSeconds: 3600,
    });

    const { data: challenge, error } = await supabaseAdmin
      .from("deposit_address_challenges")
      .select("*")
      .eq("id", data.challengeId)
      .single();
    if (error) throw new Error(error.message);
    if (challenge.user_id !== context.userId) throw new Error("Challenge not found");
    if (challenge.consumed_at) throw new Error("This challenge was already used — request a new one");
    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      throw new Error("This challenge expired — request a new one");
    }
    if (!isSignatureNetwork(challenge.network)) throw new Error("This network doesn't support address verification");

    const valid = await verifyAddressSignature(challenge.network, challenge.address, challenge.message, data.signature);
    if (!valid) {
      throw new Error("Signature verification failed — make sure you signed with the exact wallet and message shown, and copied the full signature.");
    }

    const address = challenge.address.toLowerCase();

    const { data: existingBinding } = await supabaseAdmin
      .from("deposit_source_addresses")
      .select("user_id")
      .eq("network", challenge.network)
      .eq("address", address)
      .maybeSingle();
    if (existingBinding && existingBinding.user_id !== context.userId) {
      throw new Error("This address is already registered to another account");
    }

    await supabaseAdmin.from("deposit_address_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challenge.id);

    if (!existingBinding) {
      const { error: bindErr } = await supabaseAdmin.from("deposit_source_addresses").insert({
        crypto_type: challenge.crypto_type,
        network: challenge.network,
        address,
        user_id: context.userId,
        verification_method: "signature",
      });
      if (bindErr && bindErr.code !== "23505") throw new Error(bindErr.message);
    }

    return { verified: true, address: challenge.address };
  });

export const listMyDepositSourceAddresses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("deposit_source_addresses")
      .select("network, address, verification_method, verified_at")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
