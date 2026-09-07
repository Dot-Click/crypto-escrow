// Pure types shared between client components and server-only modules —
// no server code here, safe to import from either side.
export type StepUpMethod = "none" | "email" | "totp";
export type StepUpPurpose = "login" | "withdrawal" | "release";
