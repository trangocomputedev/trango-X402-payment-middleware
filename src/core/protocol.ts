import type { X402Config } from "./types.js";

// x402 v1 clients send their payment proof via X-PAYMENT; v2 clients via
// PAYMENT-SIGNATURE. See github.com/coinbase/x402/blob/main/specs/transports-v2/http.md
// (verified 2026-08-29) — a v2 client reading no PAYMENT-REQUIRED header response would
// never even see this proof header name, but a v2 server that still only checks
// X-PAYMENT will never see the proof a compliant v2 client sends, either.
export function paymentProofHeaderName(config: X402Config): string {
  return config.wireVersion === 2 ? "PAYMENT-SIGNATURE" : "X-PAYMENT";
}
