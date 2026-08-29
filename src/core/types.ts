export type SupportedNetwork = "base" | "base-sepolia";

// The x402 wire format version emitted in the 402 challenge body.
// v1 (default): bare network string, "maxAmountRequired", top-level resource/description/mimeType.
// v2: CAIP-2 network id ("eip155:8453"), "amount", resource/description/mimeType nested under "extra".
// Coinbase's Bazaar discovery validator (platform/v2/x402/validate) rejects v1 challenges outright —
// v2 is required before a route can be considered for Bazaar/Agent.market discovery at all.
export type X402WireVersion = 1 | 2;

export interface X402Config {
  payTo: string;
  network: SupportedNetwork;
  asset?: "USDC";
  facilitatorUrl?: string;
  description?: string;
  // Defaults to 1. Existing integrations are unaffected unless this is set to 2.
  wireVersion?: X402WireVersion;
}

// Minimal JSON-Schema-shaped type — deliberately loose (not the full JSON Schema
// spec) since Bazaar's validator only inspects a handful of fields.
export interface BazaarJsonSchema {
  type?: string | string[];
  properties?: Record<string, BazaarJsonSchema>;
  required?: string[];
  description?: string;
  items?: BazaarJsonSchema;
  [key: string]: unknown;
}

// Config for declareDiscoveryExtension(). This shape is reverse-engineered from
// the check names returned live by Coinbase's public validator
// (POST https://api.cdp.coinbase.com/platform/v2/x402/validate) as of 2026-08-29 —
// Coinbase has not published a formal schema for this extension payload. See
// src/core/bazaar.ts for the full provenance note and validateDiscoveryExtension()
// for a way to confirm this against a real route before relying on it.
export interface BazaarDiscoveryConfig {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  input?: {
    type: "query" | "path" | "body";
    schema: BazaarJsonSchema;
  };
  output?: {
    schema?: BazaarJsonSchema;
    example?: unknown;
  };
}

export interface BazaarExtension {
  info: {
    input?: { type: string; method: string; schema?: BazaarJsonSchema };
    output?: { schema?: BazaarJsonSchema; example?: unknown };
  };
  schema: BazaarJsonSchema;
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
  // Bazaar discovery metadata for this route. Only emitted when the seller
  // config's wireVersion is 2 — ignored under v1. Build with declareDiscoveryExtension().
  discovery?: BazaarDiscoveryConfig;
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

export interface PaymentRequirementsV2 {
  scheme: "exact";
  network: string; // CAIP-2, e.g. "eip155:8453"
  amount: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
  extra: {
    name: string;
    version: string;
    resource: string;
    description: string;
    mimeType: string;
    bazaar?: BazaarExtension;
  };
}
