import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyPayment } from "../core/verify.js";
import { build402Body } from "../core/response.js";
import { findMatchingRoute } from "../core/matcher.js";
import type { X402Config, RouteMap, RouteValue } from "../core/types.js";

type RouteHandler = (req: NextRequest) => Promise<NextResponse> | NextResponse;

// Usage (App Router):
//   export const GET = withX402(config, routes)(async (req) => { ... });
//
// Usage (Pages Router / middleware.ts):
//   export default withX402(config, routes)(handler);
export function withX402(config: X402Config, routes: RouteMap) {
  return function (handler: RouteHandler): RouteHandler {
    return async function (req: NextRequest): Promise<NextResponse> {
      const path = new URL(req.url).pathname;
      const matchedKey = findMatchingRoute(routes, path);

      if (!matchedKey) return handler(req);

      const routeValue: RouteValue = routes[matchedKey];
      const paymentHeader = req.headers.get("X-PAYMENT");

      if (!paymentHeader) {
        return NextResponse.json(build402Body(config, req.url, routeValue), { status: 402 });
      }

      const result = await verifyPayment(paymentHeader, config, req.url, routeValue);
      if (!result.valid) {
        return NextResponse.json(
          { ...build402Body(config, req.url, routeValue), error: result.error },
          { status: 402 }
        );
      }

      return handler(req);
    };
  };
}
