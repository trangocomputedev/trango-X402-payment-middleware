# Contributing

Thanks for your interest in improving `@trango/x402-middleware`.

## Development setup

```bash
git clone https://github.com/trangocomputedev/trango-X402-payment-middleware.git
cd trango-X402-payment-middleware
npm install
```

Useful scripts:

```bash
npm run build       # bundle src/ to dist/ via tsup
npm run dev          # watch mode
npm run typecheck    # tsc --noEmit
npm test             # run the vitest suite once
npm run test:watch   # run the vitest suite in watch mode
```

## Making a change

1. Open an issue first for anything beyond a small fix, so the approach can be discussed before you invest time.
2. Fork the repo and create a branch off `main`.
3. Add or update tests in `src/core/*.test.ts` for any behavior change — core logic (matcher, resolver, networks, response, verify) should stay covered.
4. Run `npm run typecheck && npm test && npm run build` before opening a PR.
5. Open a pull request describing what changed and why. Link the issue it addresses if there is one.

## Scope

This package intentionally stays framework-agnostic at its core (`src/core/`), with thin adapters per framework (`src/adapters/`). New framework adapters or new payment networks should follow the existing adapter/network pattern rather than branching core logic on framework or network specifics.

## Reporting bugs

Open a GitHub issue with steps to reproduce. For anything touching payment verification or wallet handling, see [SECURITY.md](SECURITY.md) instead of filing a public issue.

## Questions

Reach out at trango@trango-compute.com.
