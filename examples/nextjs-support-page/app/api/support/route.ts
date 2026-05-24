import { type NextRequest, NextResponse } from "next/server";
import { withX402 } from "@trango/x402-middleware/next";

// Flexible / donate mode:
//   - minimum: the floor — user can pay this or more
//   - mode: "minimum" — enables flexible amount via ?amount= query param
//   - amountParam: query param name the client sends (default is "amount")
//
// Client flow:
//   1. User picks a tier on the page ("$1 Coffee", "$5 Lunch", or custom input)
//   2. Client calls: fetch("/api/support?amount=5.00")
//   3. Server resolves to $5.00, returns 402 for exactly $5.00
//   4. Wallet pays $5.00 → client retries with X-PAYMENT header
//   5. Server verifies $5.00 payment → returns thank-you

export const POST = withX402(
  {
    payTo: process.env.WALLET_ADDRESS!,
    network: "base-sepolia", // switch to "base" in production
  },
  {
    "/api/support": {
      amount: "1.00",       // minimum — user must pay at least 1 USDC
      mode: "minimum",
      description: "Support this project",
      amountParam: "amount", // client sends: /api/support?amount=5.00
    },
  }
)(async (req: NextRequest) => {
  const chosen = new URL(req.url).searchParams.get("amount") ?? "1.00";
  return NextResponse.json({
    message: `Thank you for your ${chosen} USDC support!`,
    timestamp: new Date().toISOString(),
  });
});
