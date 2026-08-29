import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyPayment } from "../core/verify.js";
import { build402Body } from "../core/response.js";
import { findMatchingRoute } from "../core/matcher.js";
import { resolveAmount, getAmountParam } from "../core/resolver.js";
import type { X402Config, RouteMap, RouteValue } from "../core/types.js";

type RouteHandler = (req: NextRequest) => Promise<NextResponse> | NextResponse;

// Usage — content gating (App Router):
//   export const GET = withX402(config, { "/api/download/*": "0.50" })(handler);
//
// Usage — support / donation:
//   export const POST = withX402(config, {
//     "/api/support": { amount: "1.00", mode: "minimum" }
//   })(handler);
//   Client passes chosen amount as query param: POST /api/support?amount=5.00
export function withX402(config: X402Config, routes: RouteMap) {
  return function (handler: RouteHandler): RouteHandler {
    return async function (req: NextRequest): Promise<NextResponse> {
      const url = new URL(req.url);
      const matchedKey = findMatchingRoute(routes, url.pathname);

      if (!matchedKey) return handler(req);

      const routeValue: RouteValue = routes[matchedKey];
      const requestedAmount = url.searchParams.get(getAmountParam(routeValue));
      const { payment, error: resolveError } = resolveAmount(routeValue, requestedAmount);

      const paymentHeader = req.headers.get("X-PAYMENT");

      if (!paymentHeader) {
        const body = build402Body(config, req.url, payment.amount, payment.description, payment.discovery);
        return NextResponse.json(resolveError ? { ...body, resolveError } : body, { status: 402 });
      }

      if (resolveError) {
        return NextResponse.json({ error: resolveError }, { status: 402 });
      }

      const result = await verifyPayment(paymentHeader, config, req.url, payment.amount, payment.description);
      if (!result.valid) {
        return NextResponse.json(
          { ...build402Body(config, req.url, payment.amount, payment.description, payment.discovery), error: result.error },
          { status: 402 }
        );
      }

      return handler(req);
    };
  };
}
