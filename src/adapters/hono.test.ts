import { describe, it, expect, vi, afterEach } from "vitest";
import { Hono } from "hono";
import { x402Hono } from "./hono.js";
import type { X402Config } from "../core/types.js";

const config: X402Config = { payTo: "0xWallet", network: "base" };

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
      headers: { "X-PAYMENT": "proof" },
    });
    expect(res.status).toBe(402);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 402 when the facilitator rejects the payment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isValid: false, error: "bad proof" }) })
    );

    const res = await buildApp().request("/download/file.svg", { headers: { "X-PAYMENT": "proof" } });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("bad proof");
  });

  it("calls the handler when the facilitator confirms a valid payment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isValid: true, txHash: "0xabc" }) })
    );

    const res = await buildApp().request("/download/file.svg", { headers: { "X-PAYMENT": "proof" } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("gated content");
  });
});
