import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import { x402Express } from "./express.js";
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

// Captured before any test stubs the global fetch used internally by verifyPayment,
// so requests to the local test server always hit the real network regardless of stubbing.
const realFetch = globalThis.fetch;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  const gate = x402Express(config, {
    "/download/*": "0.25",
    "/support": { amount: "1.00", mode: "minimum", description: "Support" },
  });
  app.use(gate);
  app.get("/download/:file", (_req, res) => res.send("gated content"));
  app.post("/support", (_req, res) => res.send("thanks"));
  app.get("/free", (_req, res) => res.send("no gate here"));

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("x402Express", () => {
  it("passes through routes not in the route map", async () => {
    const res = await realFetch(`${baseUrl}/free`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("no gate here");
  });

  it("returns 402 with payment requirements when no X-PAYMENT header is present", async () => {
    const res = await realFetch(`${baseUrl}/download/file.svg`);
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.accepts[0].maxAmountRequired).toBe("250000");
  });

  it("includes resolveError in the 402 body for an invalid minimum-mode amount", async () => {
    const res = await realFetch(`${baseUrl}/support?amount=0.10`, { method: "POST" });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.resolveError).toMatch(/below the minimum/);
  });

  it("returns 402 when the facilitator rejects the payment at /verify", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isValid: false, invalidReason: "bad proof" }) })
    );

    const res = await realFetch(`${baseUrl}/download/file.svg`, { headers: { "X-PAYMENT": validHeader } });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("bad proof");
  });

  it("returns 402 when /verify passes but /settle fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isValid: true, success: false, errorReason: "insufficient_funds", transaction: "", network: "base", payer: "0xPayer" }) })
    );

    const res = await realFetch(`${baseUrl}/download/file.svg`, { headers: { "X-PAYMENT": validHeader } });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("insufficient_funds");
  });

  it("calls the handler and attaches X-PAYMENT-RESPONSE once verify and settle both succeed", async () => {
    stubSettledFetch();

    const res = await realFetch(`${baseUrl}/download/file.svg`, { headers: { "X-PAYMENT": validHeader } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("gated content");

    const receiptHeader = res.headers.get("X-PAYMENT-RESPONSE");
    expect(receiptHeader).toBeTruthy();
    const receipt = JSON.parse(Buffer.from(receiptHeader!, "base64").toString("utf-8"));
    expect(receipt).toEqual({ success: true, transaction: "0xtx", network: "base", payer: "0xPayer" });
  });
});

describe("x402Express — wireVersion 2", () => {
  let v2Server: Server;
  let v2BaseUrl: string;

  beforeAll(async () => {
    const app = express();
    const v2Config: X402Config = { payTo: "0xWallet", network: "base", wireVersion: 2 };
    app.use(x402Express(v2Config, { "/download/*": "0.25" }));
    app.get("/download/:file", (_req, res) => res.send("gated content"));

    await new Promise<void>((resolve) => {
      v2Server = app.listen(0, () => resolve());
    });
    const address = v2Server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    v2BaseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    v2Server.close();
  });

  it("sets a PAYMENT-REQUIRED header and ignores X-PAYMENT", async () => {
    const res = await realFetch(`${v2BaseUrl}/download/file.svg`, { headers: { "X-PAYMENT": validHeader } });
    expect(res.status).toBe(402);
    const header = res.headers.get("PAYMENT-REQUIRED");
    expect(header).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(header!, "base64").toString("utf-8"));
    expect(decoded.x402Version).toBe(2);
  });

  it("calls the handler and attaches PAYMENT-RESPONSE when a valid PAYMENT-SIGNATURE is presented", async () => {
    stubSettledFetch();
    const res = await realFetch(`${v2BaseUrl}/download/file.svg`, { headers: { "PAYMENT-SIGNATURE": validHeader } });
    expect(res.status).toBe(200);
    expect(res.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
  });
});
