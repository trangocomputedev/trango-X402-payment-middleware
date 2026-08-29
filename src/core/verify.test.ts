import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyPayment } from "./verify.js";
import type { X402Config } from "./types.js";

const config: X402Config = { payTo: "0xWallet", network: "base" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyPayment", () => {
  it("returns valid on a successful facilitator response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ isValid: true, txHash: "0xabc" }),
      })
    );

    const result = await verifyPayment("header", config, "/r", "0.25");
    expect(result).toEqual({ valid: true, txHash: "0xabc", error: undefined });
  });

  it("returns invalid when the facilitator rejects the payment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ isValid: false, error: "Payment mismatch" }),
      })
    );

    const result = await verifyPayment("header", config, "/r", "0.25");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Payment mismatch");
  });

  it("returns an error when the facilitator responds with a non-OK status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const result = await verifyPayment("header", config, "/r", "0.25");
    expect(result).toEqual({ valid: false, error: "Facilitator returned HTTP 500" });
  });

  it("returns an error when the facilitator is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );

    const result = await verifyPayment("header", config, "/r", "0.25");
    expect(result).toEqual({ valid: false, error: "Facilitator unreachable" });
  });

  it("includes the discovery extension in the requirements submitted to the facilitator under wireVersion 2 — must match what the client signed against", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ isValid: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const v2Config: X402Config = { ...config, wireVersion: 2 };
    await verifyPayment("header", v2Config, "/r", "0.25", "desc", { method: "GET" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.x402Version).toBe(2);
    expect(body.paymentRequirements.extra.bazaar).toBeDefined();
  });

  it("uses a custom facilitatorUrl when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ isValid: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await verifyPayment("header", { ...config, facilitatorUrl: "https://custom.example/verify" }, "/r", "0.25");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://custom.example/verify",
      expect.objectContaining({ method: "POST" })
    );
  });
});
