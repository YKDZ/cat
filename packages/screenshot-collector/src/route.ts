import type { RouteManifest } from "@cat/shared/schema/extraction";

import {
  NavigationStepSchema,
  RouteManifestSchema,
} from "@cat/shared/schema/extraction";
import { resolveRouteTemplate } from "@cat/shared/utils";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

import type { ScreenshotRoute } from "./types.ts";

/**
 * Load a route manifest from a JSON or YAML file.
 * Supports both new RouteManifest format and legacy array-of-routes format.
 */
export async function loadRouteManifest(
  routesPath: string,
): Promise<RouteManifest> {
  const absPath = resolve(routesPath);
  const content = await readFile(absPath, "utf-8");

  let parsed: unknown;
  if (absPath.endsWith(".yaml") || absPath.endsWith(".yml")) {
    const { parse } = await import("yaml");
    parsed = parse(content);
  } else {
    parsed = JSON.parse(content);
  }

  // Support legacy format: plain array of { path, waitAfterLoad?, steps? }
  if (Array.isArray(parsed)) {
    const LegacyRouteArraySchema = z.array(
      z.object({
        path: z.string(),
        waitAfterLoad: z.number().optional(),
        steps: z.array(NavigationStepSchema).optional(),
        auth: z.boolean().optional(),
      }),
    );
    const legacy = LegacyRouteArraySchema.parse(parsed);
    return {
      routes: legacy.map((r) => ({
        template: r.path,
        waitAfterLoad: r.waitAfterLoad,
        steps: r.steps,
        auth: r.auth,
      })),
    };
  }

  return RouteManifestSchema.parse(parsed);
}

/**
 * Load bindings from a JSON file and validate.
 */
export async function loadBindings(
  bindingsPath: string,
): Promise<Record<string, string>> {
  const content = await readFile(resolve(bindingsPath), "utf-8");
  const parsed: unknown = JSON.parse(content);
  return z.record(z.string(), z.string()).parse(parsed);
}

/**
 * Merge bindings: file bindings as base, CLI bindings override.
 */
export function mergeBindings(
  fileBindings?: Record<string, string>,
  cliBindings?: Record<string, string>,
): Record<string, string> {
  return { ...fileBindings, ...cliBindings };
}

/**
 * Resolve a RouteManifest into concrete ScreenshotRoute[] by replacing $ref placeholders.
 */
export function resolveRoutes(
  manifest: RouteManifest,
  extraBindings?: Record<string, string>,
): ScreenshotRoute[] {
  const bindings = mergeBindings(manifest.bindings, extraBindings);

  return manifest.routes.map((entry) => ({
    path: resolveRouteTemplate(entry.template, bindings),
    waitAfterLoad: entry.waitAfterLoad,
    steps: entry.steps,
    auth: entry.auth,
  }));
}
