import { describe, it, expect } from "vitest";
import { matchesPattern, findMatchingRoute, resolveRouteValue } from "./matcher.js";
import type { RouteMap } from "./types.js";

describe("matchesPattern", () => {
  it("matches an exact literal path", () => {
    expect(matchesPattern("/download/file.svg", "/download/file.svg")).toBe(true);
    expect(matchesPattern("/download/file.svg", "/download/other.svg")).toBe(false);
  });

  it("matches * within a single path segment", () => {
    expect(matchesPattern("/download/*", "/download/file.svg")).toBe(true);
    expect(matchesPattern("/download/*", "/download/nested/file.svg")).toBe(false);
  });

  it("matches ** across multiple segments", () => {
    expect(matchesPattern("/download/**", "/download/nested/file.svg")).toBe(true);
    expect(matchesPattern("/download/**", "/download/file.svg")).toBe(true);
  });

  it("escapes regex special characters in the pattern", () => {
    expect(matchesPattern("/export/pdf", "/export/pdf")).toBe(true);
    expect(matchesPattern("/export/pdf", "/export/pdfx")).toBe(false);
  });
});

describe("findMatchingRoute", () => {
  const routes: RouteMap = {
    "/download/premium.svg": { amount: "1.00" },
    "/download/*": "0.25",
    "/export/pdf": { amount: "0.50" },
  };

  it("prioritizes an exact path match over a wildcard", () => {
    expect(findMatchingRoute(routes, "/download/premium.svg")).toBe("/download/premium.svg");
  });

  it("falls back to a wildcard match", () => {
    expect(findMatchingRoute(routes, "/download/file.svg")).toBe("/download/*");
  });

  it("returns null for unmapped routes", () => {
    expect(findMatchingRoute(routes, "/unmapped")).toBeNull();
  });
});

describe("resolveRouteValue", () => {
  it("returns the route value for a given key", () => {
    const routes: RouteMap = { "/x": "0.25" };
    expect(resolveRouteValue(routes, "/x")).toBe("0.25");
  });
});
