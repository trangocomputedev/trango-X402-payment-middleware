import { describe, it, expect } from "vitest";
import { buildPaymentRequirements, build402Body } from "./response.js";
import type { X402Config, PaymentRequirements, PaymentRequirementsV2 } from "./types.js";

const config: X402Config = { payTo: "0xWallet", network: "base" };

describe("buildPaymentRequirements", () => {
  it("converts the amount to atomic units for the configured network", () => {
    const req = buildPaymentRequirements(config, "/download/file.svg", "0.25") as PaymentRequirements;
    expect(req.maxAmountRequired).toBe("250000");
    expect(req.network).toBe("base");
    expect(req.payTo).toBe("0xWallet");
    expect(req.asset).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  });

  it("falls back to config.description, then a default", () => {
    expect((buildPaymentRequirements(config, "/r", "0.25") as PaymentRequirements).description).toBe(
      "Content access"
    );
    expect(
      (buildPaymentRequirements({ ...config, description: "Default" }, "/r", "0.25") as PaymentRequirements)
        .description
    ).toBe("Default");
    expect(
      (buildPaymentRequirements(config, "/r", "0.25", "Explicit") as PaymentRequirements).description
    ).toBe("Explicit");
  });
});

describe("build402Body", () => {
  it("wraps requirements in an x402 402 body", () => {
    const body = build402Body(config, "/r", "0.25", "desc");
    expect(body.x402Version).toBe(1);
    expect(body.error).toBe("Payment required");
    expect(body.accepts).toHaveLength(1);
    expect((body.accepts[0] as PaymentRequirements).description).toBe("desc");
  });
});

describe("buildPaymentRequirements — wireVersion 2", () => {
  const v2Config: X402Config = { payTo: "0xWallet", network: "base", wireVersion: 2 };

  it("uses a CAIP-2 network id and 'amount' instead of the v1 shape", () => {
    const req = buildPaymentRequirements(v2Config, "/download/file.svg", "0.25") as PaymentRequirementsV2;
    expect(req.network).toBe("eip155:8453");
    expect(req.amount).toBe("250000");
    expect(req.payTo).toBe("0xWallet");
    expect(req).not.toHaveProperty("maxAmountRequired");
    expect(req).not.toHaveProperty("resource");
  });

  it("nests resource, description, and mimeType under extra", () => {
    const req = buildPaymentRequirements(v2Config, "/r", "0.25", "desc") as PaymentRequirementsV2;
    expect(req.extra.resource).toBe("/r");
    expect(req.extra.description).toBe("desc");
    expect(req.extra.mimeType).toBe("*/*");
  });

  it("omits the bazaar extension when no discovery config is given", () => {
    const req = buildPaymentRequirements(v2Config, "/r", "0.25") as PaymentRequirementsV2;
    expect(req.extra.bazaar).toBeUndefined();
  });

  it("includes the bazaar extension under extra when discovery is given", () => {
    const req = buildPaymentRequirements(v2Config, "/r", "0.25", "desc", {
      method: "GET",
      output: { example: { ok: true } },
    }) as PaymentRequirementsV2;
    expect(req.extra.bazaar?.info.input?.method).toBe("GET");
    expect(req.extra.bazaar?.info.output?.example).toEqual({ ok: true });
  });
});

describe("build402Body — wireVersion 2", () => {
  it("sets x402Version to 2", () => {
    const body = build402Body({ payTo: "0xWallet", network: "base", wireVersion: 2 }, "/r", "0.25");
    expect(body.x402Version).toBe(2);
  });
});
