import type { SupportedNetwork } from "./types.js";

export interface NetworkConfig {
  chainId: number;
  name: string;
  usdcAddress: string;
  usdcDecimals: number;
  // The token contract's real on-chain ERC-20 name() — NOT a display label.
  // EIP-3009's transferWithAuthorization signature is built over an EIP-712
  // domain that includes this exact string; a client that signs against a
  // mismatched name produces a signature that will never verify against the
  // contract's real domain separator, and settlement fails silently. Verified
  // 2026-09-11 via a direct eth_call to name() on each contract below — the
  // two networks genuinely differ (Base mainnet's canonical USDC deploy is
  // named "USD Coin"; the Base Sepolia test token is named "USDC") — do not
  // assume one value applies to both.
  usdcName: string;
  isTestnet: boolean;
  explorerUrl: string;
  // CAIP-2 chain identifier ("eip155:<chainId>" for EVM chains) — the network
  // id format x402 wire version 2 uses instead of the bare v1 network string.
  caip2: string;
}

// Base mainnet and Base Sepolia are the networks the Coinbase CDP facilitator
// actively supports for X402. Both use native USDC (Circle's canonical deploy).
export const NETWORKS: Record<SupportedNetwork, NetworkConfig> = {
  "base": {
    chainId: 8453,
    name: "Base",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdcDecimals: 6,
    usdcName: "USD Coin",
    isTestnet: false,
    explorerUrl: "https://basescan.org",
    caip2: "eip155:8453",
  },
  "base-sepolia": {
    chainId: 84532,
    name: "Base Sepolia",
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    usdcDecimals: 6,
    usdcName: "USDC",
    isTestnet: true,
    explorerUrl: "https://sepolia.basescan.org",
    caip2: "eip155:84532",
  },
};

export function getNetworkConfig(network: SupportedNetwork): NetworkConfig {
  const config = NETWORKS[network];
  if (!config) throw new Error(`Unsupported network: ${network}`);
  return config;
}

// Converts a human-readable amount ("0.50") to atomic units ("500000" for USDC with 6 decimals)
export function toAtomicUnits(amount: string, decimals: number): string {
  const [whole, fraction = ""] = amount.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  const atomic = BigInt(whole) * BigInt(10 ** decimals) + BigInt(paddedFraction);
  return atomic.toString();
}
