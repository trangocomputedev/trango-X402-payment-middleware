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
