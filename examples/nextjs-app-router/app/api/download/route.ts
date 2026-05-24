import { type NextRequest, NextResponse } from "next/server";
import { withX402 } from "@trango/x402-middleware/next";

const config = {
  payTo: process.env.WALLET_ADDRESS!,
  network: "base-sepolia" as const, // switch to "base" in production
};

// Per-route pricing — more specific paths take priority over wildcards
const routes = {
  "/api/download/png": { amount: "0.50", description: "PNG export" },
  "/api/download/svg": { amount: "0.25", description: "SVG export" },
  "/api/download/*": "0.25",
};

export const GET = withX402(config, routes)(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "svg";
  const filename = `export.${format}`;

  // Generate or fetch the asset here
  const content = format === "svg"
    ? '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>'
    : Buffer.from("PNG binary data");

  return new NextResponse(content, {
    headers: {
      "Content-Type": format === "png" ? "image/png" : "image/svg+xml",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
