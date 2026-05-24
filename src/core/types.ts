export type SupportedNetwork = "base" | "base-sepolia";

export interface X402Config {
  payTo: string;
  network: SupportedNetwork;
  asset?: "USDC";
  facilitatorUrl?: string;
  description?: string;
}

export interface RouteRule {
  amount: string;
  description?: string;
}

// A route value is either a shorthand amount string or a full rule
export type RouteValue = string | RouteRule;

// Map of path patterns to payment rules. Supports exact paths and * / ** globs.
// Example: { "/api/download/*": "0.50", "/api/export/pdf": { amount: "1.00" } }
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
