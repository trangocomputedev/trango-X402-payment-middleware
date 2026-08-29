import type { BazaarDiscoveryConfig, PaymentRequirements, PaymentRequirementsV2, X402Config } from "./types.js";
import { declareDiscoveryExtension } from "./bazaar.js";
import { getNetworkConfig, toAtomicUnits } from "./networks.js";

export function buildPaymentRequirements(
  config: X402Config,
  resource: string,
  amount: string,
  description?: string,
  discovery?: BazaarDiscoveryConfig
): PaymentRequirements | PaymentRequirementsV2 {
  const network = getNetworkConfig(config.network);
  const amountAtomic = toAtomicUnits(amount, network.usdcDecimals);
  const resolvedDescription = description ?? config.description ?? "Content access";

  if (config.wireVersion === 2) {
    return {
      scheme: "exact",
      network: network.caip2,
      amount: amountAtomic,
      payTo: config.payTo,
      asset: network.usdcAddress,
      maxTimeoutSeconds: 300,
      extra: {
        name: "USDC",
        version: "2",
        resource,
        description: resolvedDescription,
        mimeType: "*/*",
        ...(discovery ? declareDiscoveryExtension(discovery) : {}),
      },
    };
  }

  return {
    scheme: "exact",
    network: config.network,
    maxAmountRequired: amountAtomic,
    resource,
    description: resolvedDescription,
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
  description?: string,
  discovery?: BazaarDiscoveryConfig
) {
  return {
    x402Version: config.wireVersion === 2 ? 2 : 1,
    accepts: [buildPaymentRequirements(config, resource, amount, description, discovery)],
    error: "Payment required",
  };
}
