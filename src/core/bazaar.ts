import type { BazaarDiscoveryConfig, BazaarExtension } from "./types.js";

// --- Provenance note ---
// Coinbase has not published a formal schema for the Bazaar discovery extension
// payload (the thing @x402/extensions/bazaar's declareDiscoveryExtension() produces
// upstream). This shape was arrived at empirically, in two rounds, against a real
// deployed route (https://contextiq.trango-compute.com/api/v2/policy-check) — not
// guessed once and left unverified:
//
// Round 1 nested the extension under accepts[0].extra.bazaar. The validator passed
// every other v2 check and failed exactly one, naming the fix directly: "No bazaar
// extension in top-level extensions object." Moved to { ...envelope, extensions: { bazaar } }.
//
// Round 2, with that fixed, the validator evaluated every bazaar.* check for the first
// time and reported two more problems by name: "bazaar.info.input.method" was skipped
// because "input type is not http" (an earlier guess used "body"/"query"/"path" for
// where request params go — wrong axis; input.type is the transport type, always "http"
// here), and "parse" failed validating the output example against `schema` and reported
// the *input* schema's required fields missing — meaning `schema` describes the OUTPUT
// contract, not the input, contrary to an earlier (unverified) assumption.
//
// Round 3, with schema now correctly mirroring output: "parse" still failed, reporting
// every field in schema.required as missing — DESPITE output.example demonstrably
// containing all of them. That's the signature of the check running against an empty
// stand-in object rather than the real example. Confirmed by removing "required"
// entirely (fields still declared, just not mandatory): "parse" passed, and
// validateDiscoveryExtension() returned valid:true / simulation.outcome:"accepted" for
// the first time. Conclusion: don't put a non-empty "required" array on the schema you
// pass as config.output.schema — it appears to make this check unpassable regardless of
// content, which looks like a limitation or bug in Coinbase's validator, not something
// fixable from the caller's side. This isn't enforced here (Coinbase may fix it), but a
// discovery config with output.schema.required will currently fail "parse" every time.
//
// Still unconfirmed even with valid:true: whether a correctly-shaped extension actually
// gets a route indexed in the Bazaar catalog. x402-foundation/x402#2112 documents
// sellers whose correctly-configured v2 challenges never got indexed regardless. Always
// run validateDiscoveryExtension() below against a real deployed route before relying on
// any of this, and don't treat a passing validator result as a guarantee of catalog
// listing.
export function declareDiscoveryExtension(config: BazaarDiscoveryConfig): { bazaar: BazaarExtension } {
  return {
    bazaar: {
      info: {
        input: { type: "http", method: config.method, schema: config.input?.schema },
        output: config.output
          ? { schema: config.output.schema, example: config.output.example }
          : undefined,
      },
      schema: config.output?.schema ?? { type: "object" },
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
