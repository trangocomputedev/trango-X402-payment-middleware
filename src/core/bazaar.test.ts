import { describe, it, expect, vi, afterEach } from "vitest";
import { declareDiscoveryExtension, validateDiscoveryExtension } from "./bazaar.js";

describe("declareDiscoveryExtension", () => {
  it("defaults to a query-input shape when no input schema is given", () => {
    const ext = declareDiscoveryExtension({ method: "GET" });
    expect(ext.bazaar.info.input).toEqual({ type: "query", method: "GET" });
    expect(ext.bazaar.schema).toEqual({ type: "object" });
  });

  it("uses the provided input schema and type/method", () => {
    const ext = declareDiscoveryExtension({
      method: "POST",
      input: { type: "body", schema: { type: "object", properties: { city: { type: "string" } } } },
    });
    expect(ext.bazaar.info.input?.type).toBe("body");
    expect(ext.bazaar.info.input?.method).toBe("POST");
    expect(ext.bazaar.schema).toEqual({ type: "object", properties: { city: { type: "string" } } });
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

  it("does not fall back to the output schema for bazaar.schema when only output is given", () => {
    const ext = declareDiscoveryExtension({
      method: "GET",
      output: { schema: { type: "object", properties: { result: { type: "string" } } } },
    });
    // bazaar.schema describes the input contract — an output-only schema here would
    // pass the validator's presence check while describing the wrong thing.
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
