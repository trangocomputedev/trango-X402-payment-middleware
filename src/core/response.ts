import type { X402Config, PaymentRequirements } from "./types.js";
import { getNetworkConfig, toAtomicUnits } from "./networks.js";

export function buildPaymentRequirements(
  config: X402Config,
  resource: string,
  amount: string,
  description?: string
): PaymentRequirements {
  const network = getNetworkConfig(config.network);

  return {
    scheme: "exact",
    network: config.network,
    maxAmountRequired: toAtomicUnits(amount, network.usdcDecimals),
    resource,
    description: description ?? config.description ?? "Content access",
    mimeType: "*/*",
    payTo: config.payTo,
    maxTimeoutSeconds: 300,
    asset: network.usdcAddress,
    extra: { name: "USDC", version: "2" },
  };
}

export function build402Body(
  config: X402Config,
  resource: string,
  amount: string,
  description?: string
) {
  return {
    x402Version: 1,
    accepts: [buildPaymentRequirements(config, resource, amount, description)],
    error: "Payment required",
  };
}
