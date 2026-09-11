import { generateJwt } from "@coinbase/cdp-sdk/auth";
import type { X402Config, VerifyResult, SettlementResponse } from "./types.js";
import { buildPaymentRequirements } from "./response.js";
import { decodeBase64 } from "./base64.js";

// The real, documented CDP facilitator base (verified live 2026-09-11 — an
// earlier version of this file guessed "platform/x402/v1/verify", which was
// never a real endpoint shape; both the correct base path below and the CDP
// authentication requirement itself were confirmed against a live 401
// response and Coinbase's own published SDK source, not assumed). "v2" here
// is CDP's own platform API versioning — unrelated to the x402 wire version
// (1 or 2) carried inside the request body.
const DEFAULT_FACILITATOR = "https://api.cdp.coinbase.com/platform/v2/x402/verify";
// The real facilitator API splits verify and settle into two distinct
// endpoints (coinbase/x402 specs/x402-specification-v1.md sections 7.1/7.2).
// A caller who overrides facilitatorUrl for /verify is assumed to be pointed
// at that facilitator's /verify path; /settle is derived by swapping the
// trailing path segment rather than requiring a second config option.
const DEFAULT_SETTLE_FACILITATOR = "https://api.cdp.coinbase.com/platform/v2/x402/settle";

function settleUrlFor(facilitatorUrl: string): string {
  return facilitatorUrl.endsWith("/verify")
    ? facilitatorUrl.replace(/\/verify$/, "/settle")
    : facilitatorUrl;
}

// CDP's REST APIs require a short-lived (120s), per-request JWT bound to the
// exact method+host+path being called — not a static header. Uses Coinbase's
// own generateJwt (backed by `jose`, EdDSA/ES256) rather than hand-rolling
// JWT signing. Returns {} (no auth header) when credentials aren't
// configured, so pointing facilitatorUrl at a facilitator that doesn't need
// CDP auth (a self-hosted one, or https://x402.org/facilitator) still works
// with no config changes.
async function buildCdpAuthHeaders(config: X402Config, url: string, method: string): Promise<Record<string, string>> {
  if (!config.cdpApiKeyId || !config.cdpApiKeySecret) return {};
  const { hostname, pathname } = new URL(url);
  const jwt = await generateJwt({
    apiKeyId: config.cdpApiKeyId,
    apiKeySecret: config.cdpApiKeySecret,
    requestMethod: method,
    requestHost: hostname,
    requestPath: pathname,
  });
  return { Authorization: `Bearer ${jwt}` };
}

/** Builds the {x402Version, paymentPayload, paymentRequirements} body both /verify and /settle expect. */
function buildFacilitatorRequest(paymentHeader: string, config: X402Config, resource: string, amount: string, description?: string) {
  const requirements = buildPaymentRequirements(config, resource, amount, description);
  let paymentPayload: unknown;
  try {
    paymentPayload = JSON.parse(decodeBase64(paymentHeader));
  } catch {
    return { error: "Malformed payment header" as const };
  }
  return {
    body: {
      x402Version: config.wireVersion === 2 ? 2 : 1,
      paymentPayload,
      paymentRequirements: requirements,
    },
  };
}

// Validates a client's payment payload against the facilitator. This is a
// cryptographic/structural check only — it does NOT execute anything
// on-chain and never returns a transaction hash (the real /verify response
// is {isValid, payer}, nothing more). Call settlePayment() separately to
// actually broadcast the payment and obtain a receipt.
export async function verifyPayment(
  paymentHeader: string,
  config: X402Config,
  resource: string,
  amount: string,
  description?: string
): Promise<VerifyResult> {
  const facilitatorUrl = config.facilitatorUrl ?? DEFAULT_FACILITATOR;
  const request = buildFacilitatorRequest(paymentHeader, config, resource, amount, description);
  if ("error" in request) return { valid: false, error: request.error };

  let res: Response;
  try {
    const authHeaders = await buildCdpAuthHeaders(config, facilitatorUrl, "POST");
    res = await fetch(facilitatorUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(request.body),
    });
  } catch {
    return { valid: false, error: "Facilitator unreachable" };
  }

  if (!res.ok) {
    return { valid: false, error: `Facilitator returned HTTP ${res.status}` };
  }

  const data = (await res.json()) as {
    isValid: boolean;
    payer?: string;
    invalidReason?: string;
  };

  return { valid: data.isValid, payer: data.payer, error: data.invalidReason };
}

// Executes a verified payment by broadcasting it to the blockchain
// (coinbase/x402 specs/x402-specification-v1.md section 7.2). Only call
// this after verifyPayment() has returned valid: true — /settle performs
// the same structural checks again plus the real transfer, so calling it
// on an already-known-invalid payment just wastes a facilitator round trip.
// The returned SettlementResponse is the receipt: it carries the real
// transaction hash verifyPayment() never had.
export async function settlePayment(
  paymentHeader: string,
  config: X402Config,
  resource: string,
  amount: string,
  description?: string
): Promise<SettlementResponse> {
  const settleUrl = config.facilitatorUrl ? settleUrlFor(config.facilitatorUrl) : DEFAULT_SETTLE_FACILITATOR;
  const request = buildFacilitatorRequest(paymentHeader, config, resource, amount, description);
  if ("error" in request) {
    return { success: false, transaction: "", network: config.network, payer: "", errorReason: request.error };
  }

  let res: Response;
  try {
    const authHeaders = await buildCdpAuthHeaders(config, settleUrl, "POST");
    res = await fetch(settleUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(request.body),
    });
  } catch {
    return { success: false, transaction: "", network: config.network, payer: "", errorReason: "Facilitator unreachable" };
  }

  if (!res.ok) {
    return { success: false, transaction: "", network: config.network, payer: "", errorReason: `Facilitator returned HTTP ${res.status}` };
  }

  const data = (await res.json()) as SettlementResponse;
  return data;
}
