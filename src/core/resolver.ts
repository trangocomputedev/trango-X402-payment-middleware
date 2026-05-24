import type { RouteValue, RouteRule } from "./types.js";

export interface ResolvedPayment {
  amount: string;
  description?: string;
}

export interface ResolveResult {
  payment: ResolvedPayment;
  // Non-null when the client-supplied amount is invalid or below the minimum.
  // The payment still holds the minimum so adapters can return a valid 402 body.
  error?: string;
}

function isValidAmount(value: string): boolean {
  const num = parseFloat(value);
  return !isNaN(num) && num > 0 && /^\d+(\.\d{1,6})?$/.test(value);
}

function toRule(routeValue: RouteValue): RouteRule {
  return typeof routeValue === "string" ? { amount: routeValue } : routeValue;
}

// Extracts the effective payment amount for a request.
//
// "exact" mode  → always uses the configured amount; requestedAmount is ignored.
// "minimum" mode → uses requestedAmount if it is a valid number >= the configured
//                  minimum; falls back to the minimum and sets an error otherwise.
export function resolveAmount(
  routeValue: RouteValue,
  requestedAmount: string | null | undefined
): ResolveResult {
  const rule = toRule(routeValue);
  const mode = rule.mode ?? "exact";
  const base: ResolvedPayment = { amount: rule.amount, description: rule.description };

  if (mode === "exact") {
    return { payment: base };
  }

  // minimum mode
  if (!requestedAmount) {
    return { payment: base };
  }

  if (!isValidAmount(requestedAmount)) {
    return { payment: base, error: "Invalid amount — must be a positive number with up to 6 decimal places" };
  }

  const minimum = parseFloat(rule.amount);
  const requested = parseFloat(requestedAmount);

  if (requested < minimum) {
    return {
      payment: base,
      error: `Amount ${requestedAmount} USDC is below the minimum of ${rule.amount} USDC`,
    };
  }

  return { payment: { amount: requestedAmount, description: rule.description } };
}

// Returns the query param name that carries the client-chosen amount.
export function getAmountParam(routeValue: RouteValue): string {
  const rule = toRule(routeValue);
  return rule.amountParam ?? "amount";
}
