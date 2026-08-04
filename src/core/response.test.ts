import { describe, it, expect } from "vitest";
import { buildPaymentRequirements, build402Body } from "./response.js";
import type { X402Config } from "./types.js";

const config: X402Config = { payTo: "0xWallet", network: "base" };

describe("buildPaymentRequirements", () => {
  it("converts the amount to atomic units for the configured network", () => {
    const req = buildPaymentRequirements(config, "/download/file.svg", "0.25");
    expect(req.maxAmountRequired).toBe("250000");
    expect(req.network).toBe("base");
    expect(req.payTo).toBe("0xWallet");
    expect(req.asset).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  });

  it("falls back to config.description, then a default", () => {
    expect(buildPaymentRequirements(config, "/r", "0.25").description).toBe("Content access");
    expect(
      buildPaymentRequirements({ ...config, description: "Default" }, "/r", "0.25").description
    ).toBe("Default");
    expect(buildPaymentRequirements(config, "/r", "0.25", "Explicit").description).toBe(
      "Explicit"
    );
  });
});

describe("build402Body", () => {
  it("wraps requirements in an x402 402 body", () => {
    const body = build402Body(config, "/r", "0.25", "desc");
    expect(body.x402Version).toBe(1);
    expect(body.error).toBe("Payment required");
    expect(body.accepts).toHaveLength(1);
    expect(body.accepts[0].description).toBe("desc");
  });
});
