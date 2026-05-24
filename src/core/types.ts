export type SupportedNetwork = "base" | "base-sepolia";

export interface X402Config {
  payTo: string;
  network: SupportedNetwork;
  asset?: "USDC";
  facilitatorUrl?: string;
  description?: string;
}

// "exact"   — client must pay exactly this amount (content gating)
// "minimum" — client may pay this amount or more (donations / support)
export type PaymentMode = "exact" | "minimum";

export interface RouteRule {
  amount: string;
  mode?: PaymentMode;
  description?: string;
  // Query param the client uses to specify their chosen amount in "minimum" mode.
  // Defaults to "amount". e.g. /api/support?amount=5.00
  amountParam?: string;
}

// A route value is either a shorthand amount string or a full rule
export type RouteValue = string | RouteRule;

// Map of path patterns to payment rules. Supports exact paths and * / ** globs.
// Example: { "/api/download/*": "0.50", "/api/support": { amount: "1.00", mode: "minimum" } }
export type RouteMap = Record<string, RouteValue>;

export interface VerifyResult {
  valid: boolean;
  txHash?: string;
  error?: string;
}

export interface PaymentRequirements {
  scheme: "exact";
  network: SupportedNetwork;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: { name: string; version: string };
}
