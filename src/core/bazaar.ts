import type { BazaarDiscoveryConfig, BazaarExtension } from "./types.js";

// --- Provenance note ---
// Coinbase has not published a formal schema for the Bazaar discovery extension
// payload (the thing @x402/extensions/bazaar's declareDiscoveryExtension() produces
// upstream). This implementation is reverse-engineered from the check names returned
// live by Coinbase's own public validator as of 2026-08-29:
//
//   POST https://api.cdp.coinbase.com/platform/v2/x402/validate
//   { "resource": "<url>", "method": "<GET|POST|...>" }
//
// which reported (against a real endpoint, in order): has_bazaar_extension, bazaar.info,
// bazaar.info.input, bazaar.info.input.type, bazaar.info.input.method, bazaar.info.output
// (advisory), bazaar.info.output.example (advisory), bazaar.schema (required). The shape
// below satisfies those checks by construction. It has not been confirmed against
// Coinbase's actual `EXTENSION-RESPONSES` indexing pipeline — a documented, independently
// reproduced bug (x402-foundation/x402#2112) means correctly-shaped v2 challenges with a
// valid discovery extension have repeatedly failed to appear in the Bazaar catalog even
// when this preflight check passes. Always run validateDiscoveryExtension() below against
// a real deployed route, and don't treat Bazaar listing as guaranteed even when it passes.
export function declareDiscoveryExtension(config: BazaarDiscoveryConfig): { bazaar: BazaarExtension } {
  // "schema" describes the input contract (sibling of info.input/info.output in the
  // validator's check ordering) — deliberately not falling back to the output schema,
  // since that would pass the presence check while describing the wrong thing.
  const schema = config.input?.schema ?? { type: "object" };

  return {
    bazaar: {
      info: {
        input: config.input
          ? { type: config.input.type, method: config.method, schema: config.input.schema }
          : { type: "query", method: config.method },
        output: config.output
          ? { schema: config.output.schema, example: config.output.example }
          : undefined,
      },
      schema,
    },
  };
}

export interface BazaarPreflightCheck {
  check: string;
  passed: boolean;
  severity: "required" | "advisory";
  detail?: string;
  expected?: unknown;
  actual?: unknown;
}

export interface BazaarValidationResult {
  valid: boolean;
  x402Version: number | null;
  rejectionReason?: string;
  checks: BazaarPreflightCheck[];
  raw: unknown;
}

const CDP_VALIDATE_URL = "https://api.cdp.coinbase.com/platform/v2/x402/validate";

// Calls Coinbase's public Bazaar preflight validator directly against a live route.
// This only checks whether the 402 challenge is shaped correctly for discovery — it does
// NOT confirm the route will actually appear in the Bazaar catalog (see the provenance
// note above). Requires no auth; it's the same free check CDP's own docs describe.
export async function validateDiscoveryExtension(
  resource: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET"
): Promise<BazaarValidationResult> {
  const res = await fetch(CDP_VALIDATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resource, method }),
  });

  const json = (await res.json()) as Record<string, unknown>;
  const simulation = json.simulation as Record<string, unknown> | undefined;

  return {
    valid: Boolean(json.valid),
    x402Version: typeof json.x402Version === "number" ? json.x402Version : null,
    rejectionReason: typeof simulation?.rejectionReason === "string" ? simulation.rejectionReason : undefined,
    checks: Array.isArray(json.preflight) ? (json.preflight as BazaarPreflightCheck[]) : [],
    raw: json,
  };
}
