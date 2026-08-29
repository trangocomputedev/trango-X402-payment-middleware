import { describe, it, expect, vi, afterEach } from "vitest";
import { declareDiscoveryExtension, validateDiscoveryExtension } from "./bazaar.js";

describe("declareDiscoveryExtension", () => {
  it("always uses type 'http' for input, regardless of config", () => {
    const ext = declareDiscoveryExtension({ method: "GET" });
    expect(ext.bazaar.info.input).toEqual({ type: "http", method: "GET", schema: undefined });
    expect(ext.bazaar.schema).toEqual({ type: "object" });
  });

  it("includes the input schema alongside type/method when given", () => {
    const ext = declareDiscoveryExtension({
      method: "POST",
      input: { schema: { type: "object", properties: { city: { type: "string" } } } },
    });
    expect(ext.bazaar.info.input?.type).toBe("http");
    expect(ext.bazaar.info.input?.method).toBe("POST");
    expect(ext.bazaar.info.input?.schema).toEqual({ type: "object", properties: { city: { type: "string" } } });
  });

  it("includes output schema/example when given", () => {
    const ext = declareDiscoveryExtension({
      method: "GET",
      output: { example: { city: "san-francisco", temperature: 60 } },
    });
    expect(ext.bazaar.info.output?.example).toEqual({ city: "san-francisco", temperature: 60 });
  });

  it("omits output when not given", () => {
    const ext = declareDiscoveryExtension({ method: "GET" });
    expect(ext.bazaar.info.output).toBeUndefined();
  });

  it("bazaar.schema describes the output contract, not the input — confirmed empirically against Coinbase's live validator", () => {
    const ext = declareDiscoveryExtension({
      method: "POST",
      input: { schema: { type: "object", properties: { endpoint: { type: "string" } }, required: ["endpoint"] } },
      output: { schema: { type: "object", properties: { result: { type: "string" } } } },
    });
    expect(ext.bazaar.schema).toEqual({ type: "object", properties: { result: { type: "string" } } });
  });

  it("falls back to a permissive object schema when no output schema is given", () => {
    const ext = declareDiscoveryExtension({
      method: "POST",
      input: { schema: { type: "object", properties: { endpoint: { type: "string" } }, required: ["endpoint"] } },
    });
    expect(ext.bazaar.schema).toEqual({ type: "object" });
  });
});

describe("validateDiscoveryExtension", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a validator response into a typed result", async () => {
    const mockResponse = {
      valid: false,
      x402Version: null,
      simulation: { outcome: "rejected", rejectionReason: "endpoint uses x402 v1; upgrade to x402 v2 for bazaar discovery" },
      preflight: [{ check: "x402_version", passed: false, severity: "required", expected: "2", actual: "1" }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: () => Promise.resolve(mockResponse) })
    );

    const result = await validateDiscoveryExtension("https://example.com/api", "POST");

    expect(result.valid).toBe(false);
    expect(result.rejectionReason).toBe("endpoint uses x402 v1; upgrade to x402 v2 for bazaar discovery");
    expect(result.checks).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.cdp.coinbase.com/platform/v2/x402/validate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ resource: "https://example.com/api", method: "POST" }),
      })
    );
  });
});
