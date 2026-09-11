import { describe, it, expect, vi, afterEach } from "vitest";
import { generateJwt } from "@coinbase/cdp-sdk/auth";
import { verifyPayment, settlePayment } from "./verify.js";
import { encodeBase64 } from "./base64.js";
import type { X402Config } from "./types.js";

vi.mock("@coinbase/cdp-sdk/auth", () => ({
  generateJwt: vi.fn().mockResolvedValue("fake-jwt"),
}));

const config: X402Config = { payTo: "0xWallet", network: "base" };

// A realistic X-PAYMENT/PAYMENT-SIGNATURE header value: base64-encoded JSON
// PaymentPayload, per coinbase/x402 specs/x402-specification-v1.md section 5.2.
const validHeader = encodeBase64(
  JSON.stringify({
    x402Version: 1,
    scheme: "exact",
    network: "base",
    payload: {
      signature: "0xsig",
      authorization: {
        from: "0xPayer",
        to: "0xWallet",
        value: "250000",
        validAfter: "0",
        validBefore: "9999999999",
        nonce: "0xnonce",
      },
    },
  })
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyPayment", () => {
  it("returns valid on a successful facilitator response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ isValid: true, payer: "0xPayer" }),
      })
    );

    const result = await verifyPayment(validHeader, config, "/r", "0.25");
    expect(result).toEqual({ valid: true, payer: "0xPayer", error: undefined });
  });

  it("returns invalid when the facilitator rejects the payment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ isValid: false, invalidReason: "insufficient_funds", payer: "0xPayer" }),
      })
    );

    const result = await verifyPayment(validHeader, config, "/r", "0.25");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("insufficient_funds");
  });

  it("returns an error when the facilitator responds with a non-OK status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const result = await verifyPayment(validHeader, config, "/r", "0.25");
    expect(result).toEqual({ valid: false, error: "Facilitator returned HTTP 500" });
  });

  it("returns an error when the facilitator is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );

    const result = await verifyPayment(validHeader, config, "/r", "0.25");
    expect(result).toEqual({ valid: false, error: "Facilitator unreachable" });
  });

  it("returns an error for a header that isn't base64-encoded JSON", async () => {
    const result = await verifyPayment("not-base64-json", config, "/r", "0.25");
    expect(result).toEqual({ valid: false, error: "Malformed payment header" });
  });

  it("decodes the header and sends it as paymentPayload, not the raw header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ isValid: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await verifyPayment(validHeader, config, "/r", "0.25");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("paymentHeader");
    expect(body.paymentPayload).toEqual({
      x402Version: 1,
      scheme: "exact",
      network: "base",
      payload: {
        signature: "0xsig",
        authorization: {
          from: "0xPayer",
          to: "0xWallet",
          value: "250000",
          validAfter: "0",
          validBefore: "9999999999",
          nonce: "0xnonce",
        },
      },
    });
  });

  it("submits x402Version 2 and the v2-shaped per-entry requirements under wireVersion 2", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ isValid: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const v2Config: X402Config = { ...config, wireVersion: 2 };
    await verifyPayment(validHeader, v2Config, "/r", "0.25", "desc");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.x402Version).toBe(2);
    expect(body.paymentRequirements.network).toBe("eip155:8453");
    expect(body.paymentRequirements.amount).toBe("250000");
    // Bazaar's discovery extension is envelope-level (buildPaymentRequiredV2's
    // "extensions" field) — verifyPayment only ever builds the per-entry requirements,
    // so it never appears here regardless of whether the route declares discovery.
    expect(body.paymentRequirements).not.toHaveProperty("extensions");
  });

  it("uses a custom facilitatorUrl when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ isValid: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await verifyPayment(validHeader, { ...config, facilitatorUrl: "https://custom.example/verify" }, "/r", "0.25");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://custom.example/verify",
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("settlePayment", () => {
  it("posts to the /settle endpoint, not /verify", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, transaction: "0xtx", network: "base", payer: "0xPayer" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await settlePayment(validHeader, config, "/r", "0.25");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cdp.coinbase.com/platform/v2/x402/settle",
      expect.objectContaining({ method: "POST" })
    );
    expect(result).toEqual({ success: true, transaction: "0xtx", network: "base", payer: "0xPayer" });
  });

  it("derives the settle URL from a custom /verify facilitatorUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, transaction: "0xtx", network: "base", payer: "0xPayer" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await settlePayment(validHeader, { ...config, facilitatorUrl: "https://custom.example/verify" }, "/r", "0.25");

    expect(fetchMock).toHaveBeenCalledWith("https://custom.example/settle", expect.anything());
  });

  it("returns a failure SettlementResponse when settlement fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: false, errorReason: "insufficient_funds", transaction: "", network: "base", payer: "0xPayer" }),
      })
    );

    const result = await settlePayment(validHeader, config, "/r", "0.25");
    expect(result.success).toBe(false);
    expect(result.errorReason).toBe("insufficient_funds");
  });

  it("returns a failure SettlementResponse when the facilitator is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));

    const result = await settlePayment(validHeader, config, "/r", "0.25");
    expect(result).toEqual({ success: false, transaction: "", network: "base", payer: "", errorReason: "Facilitator unreachable" });
  });

  it("returns a failure SettlementResponse for a malformed header", async () => {
    const result = await settlePayment("not-base64-json", config, "/r", "0.25");
    expect(result).toEqual({ success: false, transaction: "", network: "base", payer: "", errorReason: "Malformed payment header" });
  });
});

describe("CDP authentication headers", () => {
  const cdpConfig: X402Config = { ...config, cdpApiKeyId: "test-key-id", cdpApiKeySecret: "test-key-secret" };

  it("sends no Authorization header when CDP credentials aren't configured — self-hosted/community facilitators don't need it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isValid: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await verifyPayment(validHeader, config, "/r", "0.25");

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers).not.toHaveProperty("Authorization");
  });

  it("attaches a CDP JWT as a Bearer token on /verify when credentials are configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isValid: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await verifyPayment(validHeader, cdpConfig, "/r", "0.25");

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer fake-jwt");
    expect(generateJwt).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: "test-key-id",
        apiKeySecret: "test-key-secret",
        requestMethod: "POST",
        requestHost: "api.cdp.coinbase.com",
        requestPath: "/platform/v2/x402/verify",
      })
    );
  });

  it("binds the JWT to the /settle path specifically, not /verify's path", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, transaction: "0xtx", network: "base", payer: "0xPayer" }) });
    vi.stubGlobal("fetch", fetchMock);

    await settlePayment(validHeader, cdpConfig, "/r", "0.25");

    expect(generateJwt).toHaveBeenCalledWith(
      expect.objectContaining({ requestPath: "/platform/v2/x402/settle" })
    );
  });
});
