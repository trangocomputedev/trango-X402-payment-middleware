import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { verifyPayment } from "../core/verify.js";
import { build402Body } from "../core/response.js";
import { findMatchingRoute } from "../core/matcher.js";
import { resolveAmount, getAmountParam } from "../core/resolver.js";
import type { X402Config, RouteMap, RouteValue } from "../core/types.js";

// Usage — content gating:
//   const gate = x402Hono(config, { "/download/*": "0.50" });
//   app.use("/download/*", gate);
//
// Usage — support / donation:
//   const gate = x402Hono(config, { "/support": { amount: "1.00", mode: "minimum" } });
//   app.use("/support", gate);
//   Client passes chosen amount as query param: POST /support?amount=5.00
export function x402Hono(config: X402Config, routes: RouteMap) {
  return createMiddleware(async (c: Context, next) => {
    const url = new URL(c.req.url);
    const matchedKey = findMatchingRoute(routes, url.pathname);

    if (!matchedKey) return next();

    const routeValue: RouteValue = routes[matchedKey];
    const requestedAmount = url.searchParams.get(getAmountParam(routeValue));
    const { payment, error: resolveError } = resolveAmount(routeValue, requestedAmount);

    const paymentHeader = c.req.header("X-PAYMENT");

    if (!paymentHeader) {
      const body = build402Body(config, c.req.url, payment.amount, payment.description);
      return c.json(resolveError ? { ...body, resolveError } : body, 402);
    }

    if (resolveError) {
      return c.json({ error: resolveError }, 402);
    }

    const result = await verifyPayment(paymentHeader, config, c.req.url, payment.amount, payment.description);
    if (!result.valid) {
      return c.json(
        { ...build402Body(config, c.req.url, payment.amount, payment.description), error: result.error ?? "Invalid payment" },
        402
      );
    }

    return next();
  });
}
