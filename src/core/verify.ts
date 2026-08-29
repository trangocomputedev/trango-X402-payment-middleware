import type { BazaarDiscoveryConfig, X402Config, VerifyResult } from "./types.js";
import { buildPaymentRequirements } from "./response.js";

const DEFAULT_FACILITATOR = "https://api.cdp.coinbase.com/platform/x402/v1/verify";

export async function verifyPayment(
  paymentHeader: string,
  config: X402Config,
  resource: string,
  amount: string,
  description?: string,
  discovery?: BazaarDiscoveryConfig
): Promise<VerifyResult> {
  const facilitatorUrl = config.facilitatorUrl ?? DEFAULT_FACILITATOR;
  // Must match the challenge the client actually signed against (build402Body/
  // buildPaymentRequirements with the same discovery config) — a client that signed
  // a v2 challenge including extra.bazaar and gets verified against requirements
  // missing that field can fail on a facilitator-side field/hash mismatch.
  const requirements = buildPaymentRequirements(config, resource, amount, description, discovery);

  // NOTE on wireVersion 2: this sends x402Version 2 and the v2-shaped requirements
  // above to the same v1 facilitator endpoint used for v1, since no v2-specific CDP
  // settlement/verify endpoint has been confirmed. Unlike the 402-challenge shape
  // (verified live against CDP's public Bazaar validator), this settlement path has
  // NOT been confirmed against a real payment. Treat wireVersion 2 as safe for
  // discovery-only routes today; verify against a real funded wallet before relying
  // on it for a route where you actually expect paying clients.
  let res: Response;
  try {
    res = await fetch(facilitatorUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x402Version: config.wireVersion === 2 ? 2 : 1,
        paymentHeader,
        paymentRequirements: requirements,
      }),
    });
  } catch {
    return { valid: false, error: "Facilitator unreachable" };
  }

  if (!res.ok) {
    return { valid: false, error: `Facilitator returned HTTP ${res.status}` };
  }

  const data = (await res.json()) as {
    isValid: boolean;
    txHash?: string;
    error?: string;
  };

  return { valid: data.isValid, txHash: data.txHash, error: data.error };
}
