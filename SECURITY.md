# Security Policy

`@trango/x402-middleware` gates requests behind on-chain USDC payments and verifies payment proofs against a facilitator. Bugs in payment verification, amount resolution, or route matching can have direct financial impact — please report them privately rather than as a public issue.

## Reporting a vulnerability

Email **trango@trango-compute.com** with:

- A description of the vulnerability and its potential impact (e.g., bypassing payment verification, accepting an underpayment, route-matching that exposes an unintended path).
- Steps to reproduce, or a minimal proof-of-concept.
- The version/commit you tested against.

Do not open a public GitHub issue for security reports.

## What's in scope

- Payment verification logic (`src/core/verify.ts`)
- Amount resolution and validation (`src/core/resolver.ts`)
- Route/path matching (`src/core/matcher.ts`)
- Adapters (`src/adapters/*`) for request-handling bypasses

## Response

We aim to acknowledge reports within 5 business days and will follow up with a timeline for a fix once the issue is confirmed.

## Supported versions

This project is pre-1.0; security fixes are released against the latest published version on npm.
