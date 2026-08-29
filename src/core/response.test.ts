import { describe, it, expect } from "vitest";
import { buildPaymentRequirements, build402Body, buildPaymentRequiredV2, buildPaymentRequiredHeader } from "./response.js";
import { encodeBase64 } from "./base64.js";
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

  it("extra holds only name/version — not resource/description/mimeType, and never bazaar", () => {
    const req = buildPaymentRequirements(v2Config, "/r", "0.25", "desc") as PaymentRequirementsV2;
    expect(req.extra).toEqual({ name: "USDC", version: "2" });
  });
});

describe("build402Body — wireVersion 2", () => {
  const v2Config: X402Config = { payTo: "0xWallet", network: "base", wireVersion: 2 };

  it("sets x402Version to 2", () => {
    const body = build402Body(v2Config, "/r", "0.25");
    expect(body.x402Version).toBe(2);
  });

  it("puts resource/description/mimeType on the envelope, not per accept entry", () => {
    const body = buildPaymentRequiredV2(v2Config, "https://example.com/r", "0.25", "desc");
    expect(body.resource).toEqual({ url: "https://example.com/r", description: "desc", mimeType: "*/*" });
    expect(body.accepts[0]).not.toHaveProperty("resource");
  });

  it("omits extensions when no discovery config is given", () => {
    const body = buildPaymentRequiredV2(v2Config, "/r", "0.25");
    expect(body.extensions).toBeUndefined();
  });

  it("puts the bazaar extension under a top-level extensions field — confirmed against Coinbase's live validator, not accepts[].extra", () => {
    const body = buildPaymentRequiredV2(v2Config, "/r", "0.25", "desc", {
      method: "GET",
      output: { example: { ok: true } },
    });
    expect(body.extensions?.bazaar.info.input?.method).toBe("GET");
    expect(body.extensions?.bazaar.info.output?.example).toEqual({ ok: true });
    expect(body.accepts[0].extra).toEqual({ name: "USDC", version: "2" });
  });
});

describe("buildPaymentRequiredHeader", () => {
  it("returns undefined under wireVersion 1", () => {
    expect(buildPaymentRequiredHeader(config, "/r", "0.25")).toBeUndefined();
  });

  it("returns base64-encoded JSON of the v2 envelope under wireVersion 2", () => {
    const v2Config: X402Config = { payTo: "0xWallet", network: "base", wireVersion: 2 };
    const header = buildPaymentRequiredHeader(v2Config, "https://example.com/r", "0.25", "desc");
    expect(header).toBeDefined();
    const decoded = JSON.parse(Buffer.from(header!, "base64").toString("utf-8"));
    expect(decoded).toEqual(buildPaymentRequiredV2(v2Config, "https://example.com/r", "0.25", "desc"));
  });

  it("round-trips non-ASCII characters correctly (e.g. an em dash in the description)", () => {
    const v2Config: X402Config = { payTo: "0xWallet", network: "base", wireVersion: 2 };
    const header = buildPaymentRequiredHeader(v2Config, "/r", "0.25", "Policy Check — per call")!;
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
    expect(decoded.resource.description).toBe("Policy Check — per call");
  });
});

describe("encodeBase64", () => {
  it("matches Buffer-based base64 encoding for ASCII and non-ASCII input", () => {
    expect(encodeBase64("hello")).toBe(Buffer.from("hello", "utf-8").toString("base64"));
    expect(encodeBase64("— em dash —")).toBe(Buffer.from("— em dash —", "utf-8").toString("base64"));
  });
});
