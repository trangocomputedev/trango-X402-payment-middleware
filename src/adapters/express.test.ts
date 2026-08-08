import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import { x402Express } from "./express.js";
import type { X402Config } from "../core/types.js";

const config: X402Config = { payTo: "0xWallet", network: "base" };

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

  it("returns 402 when the facilitator rejects the payment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isValid: false, error: "bad proof" }) })
    );

    const res = await realFetch(`${baseUrl}/download/file.svg`, { headers: { "X-PAYMENT": "proof" } });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("bad proof");
  });

  it("calls the handler when the facilitator confirms a valid payment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isValid: true, txHash: "0xabc" }) })
    );

    const res = await realFetch(`${baseUrl}/download/file.svg`, { headers: { "X-PAYMENT": "proof" } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("gated content");
  });
});
