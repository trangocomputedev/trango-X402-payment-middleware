import { describe, it, expect, vi, afterEach } from "vitest";
import { Hono } from "hono";
import { x402Hono } from "./hono.js";
import { encodeBase64 } from "../core/base64.js";
import type { X402Config } from "../core/types.js";

const config: X402Config = { payTo: "0xWallet", network: "base" };

const validHeader = encodeBase64(
  JSON.stringify({
    x402Version: 1,
    scheme: "exact",
    network: "base",
    payload: { signature: "0xsig", authorization: { from: "0xPayer", to: "0xWallet", value: "250000", validAfter: "0", validBefore: "9999999999", nonce: "0xnonce" } },
  })
);

function stubSettledFetch() {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ isValid: true, payer: "0xPayer" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, transaction: "0xtx", network: "base", payer: "0xPayer" }) })
  );
}

function buildApp() {
  const app = new Hono();
  const gate = x402Hono(config, {
    "/download/*": "0.25",
    "/support": { amount: "1.00", mode: "minimum", description: "Support" },
  });
  app.use("/download/*", gate);
  app.use("/support", gate);
  app.get("/download/:file", (c) => c.text("gated content"));
  app.post("/support", (c) => c.text("thanks"));
  app.get("/free", (c) => c.text("no gate here"));
  return app;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("x402Hono", () => {
  it("passes through routes not in the route map", async () => {
    const res = await buildApp().request("/free");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("no gate here");
  });

  it("returns 402 with payment requirements when no X-PAYMENT header is present", async () => {
    const res = await buildApp().request("/download/file.svg");
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.accepts[0].maxAmountRequired).toBe("250000");
  });

  it("includes resolveError in the 402 body for an invalid minimum-mode amount", async () => {
    const res = await buildApp().request("/support?amount=0.10", { method: "POST" });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.resolveError).toMatch(/below the minimum/);
  });

  it("returns 402 without calling the facilitator when resolveError exists and a payment header is present", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await buildApp().request("/support?amount=0.10", {
      method: "POST",
      headers: { "X-PAYMENT": validHeader },
    });
    expect(res.status).toBe(402);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 402 when the facilitator rejects the payment at /verify", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isValid: false, invalidReason: "bad proof" }) })
    );

    const res = await buildApp().request("/download/file.svg", { headers: { "X-PAYMENT": validHeader } });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("bad proof");
  });

  it("returns 402 when /verify passes but /settle fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isValid: true, success: false, errorReason: "insufficient_funds", transaction: "", network: "base", payer: "0xPayer" }) })
    );

    const res = await buildApp().request("/download/file.svg", { headers: { "X-PAYMENT": validHeader } });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("insufficient_funds");
  });

  it("calls the handler and attaches X-PAYMENT-RESPONSE once verify and settle both succeed", async () => {
    stubSettledFetch();

    const res = await buildApp().request("/download/file.svg", { headers: { "X-PAYMENT": validHeader } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("gated content");

    const receiptHeader = res.headers.get("X-PAYMENT-RESPONSE");
    expect(receiptHeader).toBeTruthy();
    const receipt = JSON.parse(Buffer.from(receiptHeader!, "base64").toString("utf-8"));
    expect(receipt).toEqual({ success: true, transaction: "0xtx", network: "base", payer: "0xPayer" });
  });
});

describe("x402Hono — wireVersion 2", () => {
  function buildV2App() {
    const app = new Hono();
    const v2Config: X402Config = { payTo: "0xWallet", network: "base", wireVersion: 2 };
    const gate = x402Hono(v2Config, { "/download/*": "0.25" });
    app.use("/download/*", gate);
    app.get("/download/:file", (c) => c.text("gated content"));
    return app;
  }

  it("sets a PAYMENT-REQUIRED header and ignores X-PAYMENT", async () => {
    const res = await buildV2App().request("/download/file.svg", { headers: { "X-PAYMENT": validHeader } });
    expect(res.status).toBe(402);
    const header = res.headers.get("PAYMENT-REQUIRED");
    expect(header).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(header!, "base64").toString("utf-8"));
    expect(decoded.x402Version).toBe(2);
  });

  it("calls the handler and attaches PAYMENT-RESPONSE when a valid PAYMENT-SIGNATURE is presented", async () => {
    stubSettledFetch();
    const res = await buildV2App().request("/download/file.svg", { headers: { "PAYMENT-SIGNATURE": validHeader } });
    expect(res.status).toBe(200);
    expect(res.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
  });
});
