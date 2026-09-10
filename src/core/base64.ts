// UTF-8-safe base64 encode that works across Node, Cloudflare Workers (Hono), and
// edge runtimes (Next.js middleware) — none of which reliably share both `Buffer`
// and `btoa`. Needed for the x402 v2 PAYMENT-REQUIRED header, whose value is
// base64-encoded JSON that may contain non-ASCII characters (e.g. an em dash in a
// route description).
export function encodeBase64(input: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "utf-8").toString("base64");
  }
  // btoa only handles Latin1 — widen each UTF-8 byte to its own char first.
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// Reverse of encodeBase64 — needed to turn the client's X-PAYMENT /
// PAYMENT-SIGNATURE header (base64-encoded JSON PaymentPayload, per
// github.com/coinbase/x402/blob/main/specs/x402-specification-v1.md section 5.2
// and transports-v1/http.md) back into the object the facilitator's /verify
// and /settle endpoints expect under their `paymentPayload` field.
export function decodeBase64(input: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "base64").toString("utf-8");
  }
  const binary = atob(input);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
