import type { Request, Response, NextFunction } from "express";
import { verifyPayment, settlePayment } from "../core/verify.js";
import { build402Body, buildPaymentRequiredHeader, buildSettlementResponseHeader } from "../core/response.js";
import { findMatchingRoute } from "../core/matcher.js";
import { resolveAmount, getAmountParam } from "../core/resolver.js";
import { paymentProofHeaderName, settlementHeaderName } from "../core/protocol.js";
import type { X402Config, RouteMap, RouteValue } from "../core/types.js";

// Usage — content gating:
//   app.use(x402Express(config, { "/download/*": "0.50" }));
//
// Usage — support / donation:
//   app.use(x402Express(config, { "/support": { amount: "1.00", mode: "minimum" } }));
//   Client passes chosen amount as query param: POST /support?amount=5.00
export function x402Express(config: X402Config, routes: RouteMap) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const matchedKey = findMatchingRoute(routes, req.path);

    if (!matchedKey) return next();

    const routeValue: RouteValue = routes[matchedKey];
    const requestedAmount = req.query[getAmountParam(routeValue)] as string | undefined;
    const { payment, error: resolveError } = resolveAmount(routeValue, requestedAmount);

    const paymentHeader = req.headers[paymentProofHeaderName(config).toLowerCase()] as string | undefined;

    if (!paymentHeader) {
      const body = build402Body(config, req.url, payment.amount, payment.description, payment.discovery);
      const headerValue = buildPaymentRequiredHeader(config, req.url, payment.amount, payment.description, payment.discovery);
      if (headerValue) res.set("PAYMENT-REQUIRED", headerValue);
      return res.status(402).json(resolveError ? { ...body, resolveError } : body);
    }

    if (resolveError) {
      return res.status(402).json({ error: resolveError });
    }

    const result = await verifyPayment(paymentHeader, config, req.url, payment.amount, payment.description);
    if (!result.valid) {
      const headerValue = buildPaymentRequiredHeader(config, req.url, payment.amount, payment.description, payment.discovery);
      if (headerValue) res.set("PAYMENT-REQUIRED", headerValue);
      return res.status(402).json({
        ...build402Body(config, req.url, payment.amount, payment.description, payment.discovery),
        error: result.error,
      });
    }

    // /verify only validates the payload — the payment isn't actually
    // executed (and no real receipt exists) until /settle broadcasts it.
    const settlement = await settlePayment(paymentHeader, config, req.url, payment.amount, payment.description);
    if (!settlement.success) {
      const headerValue = buildPaymentRequiredHeader(config, req.url, payment.amount, payment.description, payment.discovery);
      if (headerValue) res.set("PAYMENT-REQUIRED", headerValue);
      return res.status(402).json({
        ...build402Body(config, req.url, payment.amount, payment.description, payment.discovery),
        error: settlement.errorReason ?? "Settlement failed",
      });
    }

    res.set(settlementHeaderName(config), buildSettlementResponseHeader(settlement));
    return next();
  };
}
