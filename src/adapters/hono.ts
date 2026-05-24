import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { verifyPayment } from "../core/verify.js";
import { build402Body } from "../core/response.js";
import { findMatchingRoute } from "../core/matcher.js";
import type { X402Config, RouteMap, RouteValue } from "../core/types.js";

// Usage:
//   const gate = x402Hono(config, { "/download/*": "0.50", "/export/pdf": { amount: "1.00" } });
//   app.use("/download/*", gate);
//   app.use("/export/*", gate);
export function x402Hono(config: X402Config, routes: RouteMap) {
  return createMiddleware(async (c: Context, next) => {
    const path = new URL(c.req.url).pathname;
    const matchedKey = findMatchingRoute(routes, path);

    if (!matchedKey) return next();

    const routeValue: RouteValue = routes[matchedKey];
    const paymentHeader = c.req.header("X-PAYMENT");

    if (!paymentHeader) {
      return c.json(build402Body(config, c.req.url, routeValue), 402);
    }

    const result = await verifyPayment(paymentHeader, config, c.req.url, routeValue);
    if (!result.valid) {
      return c.json(
        { ...build402Body(config, c.req.url, routeValue), error: result.error ?? "Invalid payment" },
        402
      );
    }

    return next();
  });
}
