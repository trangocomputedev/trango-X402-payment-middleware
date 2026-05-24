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

  let res: Response;
  try {
    res = await fetch(facilitatorUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x402Version: 1,
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
