import type { RouteMap, RouteValue } from "./types.js";

// Matches a path against a glob pattern.
// * matches any single path segment characters (not /)
// ** matches any characters including /
export function matchesPattern(pattern: string, path: string): boolean {
  if (!pattern.includes("*")) return pattern === path;

  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\x00")
    .replace(/\*/g, "[^/]*")
    .replace(/\x00/g, ".*");

  return new RegExp(`^${regexStr}$`).test(path);
}

// Returns the matched pattern key from the route map, or null if no match.
// Exact matches take priority over glob patterns.
export function findMatchingRoute(routeMap: RouteMap, path: string): string | null {
  if (routeMap[path] !== undefined) return path;

  for (const pattern of Object.keys(routeMap)) {
    if (pattern !== path && matchesPattern(pattern, path)) {
      return pattern;
    }
  }

  return null;
}

export function resolveRouteValue(routeMap: RouteMap, key: string): RouteValue {
  return routeMap[key];
}
