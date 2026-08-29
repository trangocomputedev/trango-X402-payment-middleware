import type { X402Config, VerifyResult } from "./types.js";
import { buildPaymentRequirements } from "./response.js";

const DEFAULT_FACILITATOR = "https://api.cdp.coinbase.com/platform/x402/v1/verify";

export async function verifyPayment(
  paymentHeader: string,
  config: X402Config,
  resource: string,
  amount: string,
  description?: string
): Promise<VerifyResult> {
  const facilitatorUrl = config.facilitatorUrl ?? DEFAULT_FACILITATOR;
  const requirements = buildPaymentRequirements(config, resource, amount, description);

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
