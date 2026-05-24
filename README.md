# @trango/x402-middleware

Framework-agnostic X402 stablecoin payment middleware. Gate any API endpoint or file download behind a USDC micropayment — verified on-chain before the request reaches your handler.

Works on **Hono** (Cloudflare Workers), **Next.js** (App Router + Pages Router), and **Express**.

---

## How It Works

```
1. Client requests /api/download/image.svg
2. Server returns HTTP 402 + payment requirements JSON
3. Client wallet pays the exact USDC amount on Base
4. Client re-sends request with X-PAYMENT header (signed payment proof)
5. Middleware verifies proof with Coinbase CDP facilitator
6. Verified → handler runs and serves the file
```

No custodial wallets. No subscriptions. Payment goes directly to your wallet address.

---

## Networks

X402 uses the Coinbase CDP facilitator for on-chain payment verification. The following networks are supported:

| Network | Chain ID | Status | When to use |
|---------|----------|--------|-------------|
| `base` | 8453 | **Mainnet** | Production — real USDC |
| `base-sepolia` | 84532 | **Testnet** | Development — free test USDC from faucet |

**Why Base?**
- Transaction fees under $0.001 — essential for micropayments
- USDC is natively deployed by Circle (no bridged token risk)
- Coinbase CDP facilitator has first-class Base support
- Settlement is near-instant (~2 seconds)

**USDC contract addresses (for reference):**
- Base mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

**Adding other networks:** The package exposes `facilitatorUrl` in config. If a third-party facilitator supports Ethereum, Optimism, or Polygon, you can point the middleware at it — the core verification logic is network-agnostic. Official CDP support for additional EVM chains is expected as X402 matures.

**Getting test USDC (Base Sepolia):**
Visit `https://faucet.circle.com` and select Base Sepolia to receive free testnet USDC.

---

## Installation

```bash
npm install @trango/x402-middleware
```

Peer dependencies — install the one(s) you use:

```bash
npm install hono          # for Cloudflare Workers
npm install next          # for Next.js
npm install express       # for Node.js
```

---

## Quick Start

### Hono (Cloudflare Workers)

```ts
import { Hono } from "hono";
import { x402Hono } from "@trango/x402-middleware/hono";

const app = new Hono();

const gate = x402Hono(
  {
    payTo: "0xYourWalletAddress",
    network: "base",                    // or "base-sepolia" for testing
  },
  {
    "/download/*": "0.25",              // 0.25 USDC for any /download/* path
    "/export/pdf": { amount: "0.50", description: "PDF export" },
    "/export/bulk": { amount: "2.00", description: "Bulk ZIP export" },
  }
);

app.use("/download/*", gate);
app.use("/export/*", gate);

app.get("/download/:file", async (c) => {
  // Only reached after payment is verified
  return c.body(svgContent, 200, { "Content-Type": "image/svg+xml" });
});

export default app;
```

### Next.js (App Router)

```ts
// app/api/download/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { withX402 } from "@trango/x402-middleware/next";

export const GET = withX402(
  {
    payTo: process.env.WALLET_ADDRESS!,
    network: "base",
  },
  {
    "/api/download/png": { amount: "0.50", description: "PNG export" },
    "/api/download/svg": { amount: "0.25", description: "SVG export" },
    "/api/download/*": "0.25",          // fallback for any other format
  }
)(async (req: NextRequest) => {
  // Only reached after payment is verified
  return new NextResponse(fileContent, {
    headers: { "Content-Type": "image/svg+xml" },
  });
});
```

### Express

```ts
import express from "express";
import { x402Express } from "@trango/x402-middleware/express";

const app = express();

app.use(
  x402Express(
    {
      payTo: "0xYourWalletAddress",
      network: "base",
    },
    {
      "/download/*": "0.25",
      "/export/report": { amount: "1.00", description: "Report export" },
    }
  )
);

app.get("/download/:file", (req, res) => {
  // Only reached after payment is verified
  res.sendFile(path.join(__dirname, "files", req.params.file));
});
```

---

## Support / Donation Mode

Set `mode: "minimum"` on any route to accept flexible amounts. The client passes their chosen amount as a query parameter — the server enforces the floor and verifies the exact payment on-chain.

```ts
// Server — Next.js App Router
export const POST = withX402(
  { payTo: process.env.WALLET_ADDRESS!, network: "base" },
  {
    "/api/support": {
      amount: "1.00",       // minimum floor in USDC
      mode: "minimum",
      description: "Support this project",
      // amountParam: "amount" is the default — client sends ?amount=5.00
    },
  }
)(async (req) => {
  const chosen = new URL(req.url).searchParams.get("amount") ?? "1.00";
  return NextResponse.json({ message: `Thank you for your ${chosen} USDC support!` });
});
```

```ts
// Client — using x402-fetch
import { wrapFetchWithPayment } from "x402-fetch";
const fetch402 = wrapFetchWithPayment(fetch, wallet);

// User picked $5 on the UI
await fetch402("/api/support?amount=5.00", { method: "POST" });
```

**What happens on the wire:**
1. Client calls `POST /api/support?amount=5.00`
2. Server resolves $5.00 (≥ $1.00 minimum ✓), returns `402` with requirements for exactly $5.00
3. `x402-fetch` prompts wallet → user approves $5.00 USDC payment on Base
4. Client retries with `X-PAYMENT` proof header
5. Server verifies the $5.00 on-chain payment → returns thank-you response

**Validation errors (amount below minimum):**
If the client sends `?amount=0.50` (below $1.00 floor), the server returns:
```json
{ "error": "Amount 0.50 USDC is below the minimum of 1.00 USDC" }
```
The UI should validate amounts before calling the endpoint to give users a better experience.

See `examples/nextjs-support-page/` for a full working support page with tier buttons and a custom amount input.

---

## Configuration Reference

### `X402Config`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `payTo` | `string` | Yes | Your wallet address that receives USDC payments |
| `network` | `"base" \| "base-sepolia"` | Yes | Blockchain network |
| `asset` | `"USDC"` | No | Payment asset (only USDC in v1) |
| `facilitatorUrl` | `string` | No | Override the CDP facilitator endpoint |
| `description` | `string` | No | Default description shown in wallet UI |

### `RouteMap`

A record of path patterns to payment rules. Supports:

```ts
type PaymentMode = "exact" | "minimum";

type RouteMap = Record<string, string | {
  amount: string;
  mode?: PaymentMode;      // default: "exact"
  description?: string;
  amountParam?: string;    // default: "amount" — query param for client amount in "minimum" mode
}>;
```

| `mode` | Behaviour |
|--------|-----------|
| `"exact"` | Client must pay exactly `amount`. Use for content gating (downloads, API access). |
| `"minimum"` | Client may pay `amount` or more. Use for support buttons and donations. |

**Path matching rules:**
- Exact paths take priority over patterns: `/download/premium.svg` matches before `/download/*`
- `*` matches any characters within a single path segment
- `**` matches any characters across multiple segments
- Routes not in the map pass through without payment

**Examples:**
```ts
const routes = {
  // Shorthand string — always "exact" mode
  "/download/*": "0.25",

  // Exact mode with description
  "/export/pdf": { amount: "0.50", description: "PDF report" },

  // Exact path takes priority over the wildcard above
  "/download/premium.svg": { amount: "1.00", description: "Premium SVG" },

  // Donation — user pays 1 USDC or more via ?amount= query param
  "/support": { amount: "1.00", mode: "minimum", description: "Support this project" },

  // Custom param name — client sends ?tip=5.00 instead of ?amount=5.00
  "/tip": { amount: "0.50", mode: "minimum", amountParam: "tip" },
};
```

---

## Client Side

Users need a wallet that implements X402. The easiest option is Coinbase's `x402-fetch` package, which transparently handles the 402 → pay → retry flow:

```ts
import { wrapFetchWithPayment } from "x402-fetch";

const fetch402 = wrapFetchWithPayment(fetch, wallet);

// Automatically handles payment if the server returns 402
const res = await fetch402("/api/download/image.svg");
const blob = await res.blob();
```

---

## Development Workflow

1. Set `network: "base-sepolia"` in config
2. Get test USDC from `https://faucet.circle.com` (Base Sepolia)
3. Use a wallet with Base Sepolia configured (Coinbase Wallet supports it)
4. Test the full payment flow at zero real cost
5. Switch to `network: "base"` for production

---

## Package Layout

```
src/
  core/
    types.ts      ← shared TypeScript types
    networks.ts   ← network configs and USDC addresses
    verify.ts     ← CDP facilitator verification
    response.ts   ← 402 response builder
    matcher.ts    ← path pattern matching
  adapters/
    hono.ts       ← Hono / Cloudflare Workers middleware
    next.ts       ← Next.js App Router HOF
    express.ts    ← Express middleware
  index.ts        ← re-exports everything
examples/
  hono-cloudflare/
  nextjs-app-router/
```

---

## License

MIT — Trango Compute
