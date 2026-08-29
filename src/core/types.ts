export type SupportedNetwork = "base" | "base-sepolia";

// The x402 wire format version emitted for a 402 challenge.
// v1 (default): body-only. Bare network string, "maxAmountRequired", top-level
// resource/description/mimeType per accept entry. Payment proof arrives via X-PAYMENT.
// v2: per the official spec (github.com/coinbase/x402/blob/main/specs/transports-v2/http.md,
// verified 2026-08-29) — the protocol-relevant payload is NOT the JSON body. It's a
// base64-encoded PaymentRequired object in a PAYMENT-REQUIRED response header:
// { x402Version: 2, error?, resource: { url, description, mimeType }, accepts: [...] }
// where each accepts[] entry uses a CAIP-2 network id ("eip155:8453"), "amount" instead
// of "maxAmountRequired", and an extra bag holding only { name, version } (resource/
// description/mimeType live once on the envelope, not per accept entry). The client's
// payment proof arrives via PAYMENT-SIGNATURE, not X-PAYMENT. Coinbase's Bazaar discovery
// validator (platform/v2/x402/validate) requires the header — it will not evaluate
// anything else about a route, including discovery-extension checks, without it.
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
  // Per spec, extra holds only the EIP-712 domain fields for "exact" on EVM. The Bazaar
  // extension is Coinbase-specific and not part of the core spec — its placement here is
  // a best guess pending confirmation via validateDiscoveryExtension() against a real route.
  extra: {
    name: string;
    version: string;
    bazaar?: BazaarExtension;
  };
}

// The full v2 402 envelope — what gets base64-encoded into the PAYMENT-REQUIRED header.
// resource is envelope-level (one resource per response), not per accept entry.
export interface PaymentRequiredV2 {
  x402Version: 2;
  error: string;
  resource: { url: string; description: string; mimeType: string };
  accepts: PaymentRequirementsV2[];
}
