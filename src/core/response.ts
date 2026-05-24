import type { X402Config, RouteValue, PaymentRequirements } from "./types.js";
import { getNetworkConfig, toAtomicUnits } from "./networks.js";

function normalize(value: RouteValue): { amount: string; description?: string } {
  return typeof value === "string" ? { amount: value } : value;
}

export function buildPaymentRequirements(
  config: X402Config,
  resource: string,
  routeValue: RouteValue
): PaymentRequirements {
  const { amount, description } = normalize(routeValue);
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
  routeValue: RouteValue
) {
  return {
    x402Version: 1,
    accepts: [buildPaymentRequirements(config, resource, routeValue)],
    error: "Payment required",
  };
}
