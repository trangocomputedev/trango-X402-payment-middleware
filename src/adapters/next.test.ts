import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "./next.js";
import { encodeBase64 } from "../core/base64.js";
import type { X402Config } from "../core/types.js";

const config: X402Config = { payTo: "0xWallet", network: "base" };

const routes = {
  "/api/download/*": "0.25",
  "/api/support": { amount: "1.00", mode: "minimum" as const, description: "Support" },
};

const handler = vi.fn(async (req: NextRequest) => NextResponse.json({ ok: true }));

// A realistic X-PAYMENT/PAYMENT-SIGNATURE header value — see verify.test.ts for
// why a bare "proof" string no longer works (verify/settle now decode this).
const validHeader = encodeBase64(
  JSON.stringify({
    x402Version: 1,
    scheme: "exact",
    network: "base",
    payload: { signature: "0xsig", authorization: { from: "0xPayer", to: "0xWallet", value: "250000", validAfter: "0", validBefore: "9999999999", nonce: "0xnonce" } },
  })
);

// verifyPayment and settlePayment each make their own facilitator call —
// stub /verify's {isValid, payer} response first, then /settle's
// {success, transaction, network, payer} response.
function stubSettledFetch() {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ isValid: true, payer: "0xPayer" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, transaction: "0xtx", network: "base", payer: "0xPayer" }) })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  handler.mockClear();
});

describe("withX402", () => {
  it("passes through routes not in the route map", async () => {
    const gated = withX402(config, routes)(handler);
    const res = await gated(new NextRequest("https://example.com/free"));
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("returns 402 with payment requirements when no X-PAYMENT header is present", async () => {
    const gated = withX402(config, routes)(handler);
    const res = await gated(new NextRequest("https://example.com/api/download/file.svg"));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.accepts[0].maxAmountRequired).toBe("250000");
    expect(handler).not.toHaveBeenCalled();
  });

  it("includes resolveError in the 402 body for an invalid minimum-mode amount", async () => {
    const gated = withX402(config, routes)(handler);
    const res = await gated(
      new NextRequest("https://example.com/api/support?amount=0.10", { method: "POST" })
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.resolveError).toMatch(/below the minimum/);
  });

  it("returns 402 when the facilitator rejects the payment at /verify", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isValid: false, invalidReason: "bad proof" }) })
    );

    const gated = withX402(config, routes)(handler);
    const res = await gated(
      new NextRequest("https://example.com/api/download/file.svg", {
        headers: { "X-PAYMENT": validHeader },
      })
    );
    expect(res.status).toBe(402);
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 402 when /verify passes but /settle fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isValid: true, success: false, errorReason: "insufficient_funds", transaction: "", network: "base", payer: "0xPayer" }) })
    );

    const gated = withX402(config, routes)(handler);
    const res = await gated(
      new NextRequest("https://example.com/api/download/file.svg", {
        headers: { "X-PAYMENT": validHeader },
      })
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("insufficient_funds");
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls the handler and attaches X-PAYMENT-RESPONSE once verify and settle both succeed", async () => {
    stubSettledFetch();

    const gated = withX402(config, routes)(handler);
    const res = await gated(
      new NextRequest("https://example.com/api/download/file.svg", {
        headers: { "X-PAYMENT": validHeader },
      })
    );
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();

    const receiptHeader = res.headers.get("X-PAYMENT-RESPONSE");
    expect(receiptHeader).toBeTruthy();
    const receipt = JSON.parse(Buffer.from(receiptHeader!, "base64").toString("utf-8"));
    expect(receipt).toEqual({ success: true, transaction: "0xtx", network: "base", payer: "0xPayer" });
  });
});

describe("withX402 — wireVersion 2", () => {
  const v2Config: X402Config = { payTo: "0xWallet", network: "base", wireVersion: 2 };

  it("sets a PAYMENT-REQUIRED header on the 402 response, base64-encoding the v2 envelope", async () => {
    const gated = withX402(v2Config, routes)(handler);
    const res = await gated(new NextRequest("https://example.com/api/download/file.svg"));
    expect(res.status).toBe(402);
    const header = res.headers.get("PAYMENT-REQUIRED");
    expect(header).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(header!, "base64").toString("utf-8"));
    expect(decoded.x402Version).toBe(2);
    expect(decoded.resource.url).toBe("https://example.com/api/download/file.svg");
  });

  it("ignores X-PAYMENT and looks for PAYMENT-SIGNATURE instead", async () => {
    const gated = withX402(v2Config, routes)(handler);
    const res = await gated(
      new NextRequest("https://example.com/api/download/file.svg", { headers: { "X-PAYMENT": validHeader } })
    );
    // X-PAYMENT is the wrong header under v2 — still treated as unpaid, still 402.
    expect(res.status).toBe(402);
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls the handler and attaches PAYMENT-RESPONSE when a valid PAYMENT-SIGNATURE is presented", async () => {
    stubSettledFetch();

    const gated = withX402(v2Config, routes)(handler);
    const res = await gated(
      new NextRequest("https://example.com/api/download/file.svg", {
        headers: { "PAYMENT-SIGNATURE": validHeader },
      })
    );
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(res.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
  });
});
