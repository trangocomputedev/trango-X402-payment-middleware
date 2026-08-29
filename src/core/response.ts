import type { BazaarDiscoveryConfig, PaymentRequirements, PaymentRequirementsV2, PaymentRequiredV2, X402Config } from "./types.js";
import { declareDiscoveryExtension } from "./bazaar.js";
import { encodeBase64 } from "./base64.js";
import { getNetworkConfig, toAtomicUnits } from "./networks.js";

export function buildPaymentRequirements(
  config: X402Config,
  resource: string,
  amount: string,
  description?: string
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
      extra: { name: "USDC", version: "2" },
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

// The full v2 402 envelope (github.com/coinbase/x402/blob/main/specs/transports-v2/http.md):
// resource is envelope-level, shared by every accept option, not duplicated per entry.
// extensions.bazaar is envelope-level too — confirmed empirically (see PaymentRequiredV2's
// doc comment in types.ts) after Coinbase's live validator rejected an earlier version of
// this package that nested it under accepts[0].extra.bazaar instead.
export function buildPaymentRequiredV2(
  config: X402Config,
  resource: string,
  amount: string,
  description?: string,
  discovery?: BazaarDiscoveryConfig
): PaymentRequiredV2 {
  const resolvedDescription = description ?? config.description ?? "Content access";
  return {
    x402Version: 2,
    error: "Payment required",
    resource: { url: resource, description: resolvedDescription, mimeType: "*/*" },
    accepts: [buildPaymentRequirements(config, resource, amount, description) as PaymentRequirementsV2],
    extensions: discovery ? declareDiscoveryExtension(discovery) : undefined,
  };
}

export function build402Body(
  config: X402Config,
  resource: string,
  amount: string,
  description?: string,
  discovery?: BazaarDiscoveryConfig
) {
  if (config.wireVersion === 2) {
    return buildPaymentRequiredV2(config, resource, amount, description, discovery);
  }
  return {
    x402Version: 1,
    accepts: [buildPaymentRequirements(config, resource, amount, description)],
    error: "Payment required",
  };
}

// The x402 v2 spec puts the protocol-relevant payload in this header, base64-encoded —
// not in the response body, which the spec calls "a server implementation concern".
// Coinbase's Bazaar discovery validator will not evaluate anything about a route
// (including discovery-extension checks) without this header present. Returns undefined
// for wireVersion 1, where no such header exists.
export function buildPaymentRequiredHeader(
  config: X402Config,
  resource: string,
  amount: string,
  description?: string,
  discovery?: BazaarDiscoveryConfig
): string | undefined {
  if (config.wireVersion !== 2) return undefined;
  const envelope = buildPaymentRequiredV2(config, resource, amount, description, discovery);
  return encodeBase64(JSON.stringify(envelope));
}
