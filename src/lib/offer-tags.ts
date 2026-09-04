/**
 * Freeform-but-curated offer tags, matching BitValve's "Optional Settings"
 * checklist on their create-offer form (verification, physical/e-code gift
 * card handling, third-party accounts, VPN policy). Each pair is mutually
 * exclusive — picking one side unchecks its opposite — since checking both
 * "No VPN" and "VPN allowed" at once wouldn't mean anything.
 */
export type OfferTagOption = { value: string; label: string; description: string };
export type OfferTagPair = { pairWith?: string } & OfferTagOption;

export const OFFER_TAG_PAIRS: [OfferTagOption, OfferTagOption][] = [
  [
    { value: "no_verification", label: "No Verification", description: "You can start trade without verifying (KYC) your account." },
    { value: "verification_needed", label: "Verification Needed", description: "You must verify your account (KYC) to start this trade." },
  ],
  [
    { value: "no_phone_verification", label: "No Phone Verification", description: "You can start trade without verifying your phone." },
    { value: "phone_verification_needed", label: "Phone Verification Needed", description: "You must verify your phone to start this trade." },
  ],
  [
    { value: "no_physical_cards", label: "No Physical Cards", description: "No physical cards are accepted." },
    { value: "physical_card_accepted", label: "Physical Card", description: "Physical cards are accepted for this trade." },
  ],
  [
    { value: "e_codes_accepted", label: "E-codes", description: "E-codes from e-gift cards are accepted." },
    { value: "no_e_codes", label: "No E-codes", description: "No e-codes from e-gift cards are accepted." },
  ],
  [
    { value: "no_third_party", label: "No third Party", description: "Using 3rd party accounts is not allowed." },
    { value: "third_party_accepted", label: "Third Party accepted", description: "Using 3rd party accounts are allowed." },
  ],
  [
    { value: "no_vpn", label: "No VPN", description: "VPN use is not allowed." },
    { value: "vpn_allowed", label: "VPN allowed", description: "VPN use is allowed." },
  ],
];

export const OFFER_TAGS: OfferTagOption[] = OFFER_TAG_PAIRS.flat();

export function offerTagLabel(value: string): string {
  return OFFER_TAGS.find((t) => t.value === value)?.label ?? value;
}
