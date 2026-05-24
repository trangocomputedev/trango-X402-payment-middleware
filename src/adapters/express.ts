import type { Request, Response, NextFunction } from "express";
import { verifyPayment } from "../core/verify.js";
import { build402Body } from "../core/response.js";
import { findMatchingRoute } from "../core/matcher.js";
import type { X402Config, RouteMap, RouteValue } from "../core/types.js";

// Usage:
//   app.use(x402Express(config, { "/download/*": "0.50" }));
export function x402Express(config: X402Config, routes: RouteMap) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const matchedKey = findMatchingRoute(routes, req.path);

    if (!matchedKey) return next();

    const routeValue: RouteValue = routes[matchedKey];
    const paymentHeader = req.headers["x-payment"] as string | undefined;

    if (!paymentHeader) {
      return res.status(402).json(build402Body(config, req.url, routeValue));
    }

    const result = await verifyPayment(paymentHeader, config, req.url, routeValue);
    if (!result.valid) {
      return res.status(402).json({
        ...build402Body(config, req.url, routeValue),
        error: result.error,
      });
    }

    return next();
  };
}
