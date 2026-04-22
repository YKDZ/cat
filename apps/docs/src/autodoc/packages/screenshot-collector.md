# @cat/screenshot-collector

## Overview

* **Modules**: 5

* **Exported functions**: 10

* **Exported types**: 6

## Function Index

### packages/screenshot-collector/src

### `authenticateBrowser`

```ts
/**
 * Handle browser authentication.
 * If storageStatePath is provided and valid, restore session from it.
 * Otherwise, navigate to login page and fill the multi-step auth flow
 * (identifier → password, driven by Ory Kratos).
 */
export async function authenticateBrowser(context: BrowserContext, baseUrl: string, options: AuthOptions): Promise<void>
```

### `loadRouteManifest`

```ts
/**
 * Load a route manifest from a JSON or YAML file.
 * Supports both new RouteManifest format and legacy array-of-routes format.
 */
export async function loadRouteManifest(routesPath: string): Promise<{ routes: { template: string; waitAfterLoad?: number | undefined; waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit" | undefined; steps?: ({ action: "click"; selector: string; } | { action: "fill"; selector: string; value: string; } | { action: "wait"; ms: number; })[] | undefined; auth?: boolean | undefined; }[]; bindings?: Record<string, string> | undefined; }>
```

### `loadBindings`

```ts
/**
 * Load bindings from a JSON file and validate.
 */
export async function loadBindings(bindingsPath: string): Promise<Record<string, string>>
```

### `mergeBindings`

```ts
/**
 * Merge bindings: file bindings as base, CLI bindings override.
 */
export function mergeBindings(fileBindings?: Record<string, string> | undefined, cliBindings?: Record<string, string> | undefined): Record<string, string>
```

### `resolveRoutes`

```ts
/**
 * Resolve a RouteManifest into concrete ScreenshotRoute[] by replacing $ref placeholders.
 */
export function resolveRoutes(manifest: { routes: { template: string; waitAfterLoad?: number | undefined; waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit" | undefined; steps?: ({ action: "click"; selector: string; } | { action: "fill"; selector: string; value: string; } | { action: "wait"; ms: number; })[] | undefined; auth?: boolean | undefined; }[]; bindings?: Record<string, string> | undefined; }, extraBindings?: Record<string, string> | undefined): ScreenshotRoute[]
```

### `collectScreenshots`

```ts
/**
 * Collect screenshots: launch browser, traverse routes, locate elements and screenshot.
 * For each route, iterates unique element texts and takes one screenshot per text.
 * Each screenshot is associated with the first element matching that text (not all).
 */
export async function collectScreenshots(options: ScreenshotCollectOptions): Promise<CapturedScreenshot[]>
```

### `captureScreenshots`

```ts
/**
 * Capture screenshots for elements across routes, returning CaptureResult.
 * Similar to collectScreenshots but works with ExtractionResult elements
 * and returns the new CaptureResult format.
 */
export async function captureScreenshots(options: CaptureOptions): Promise<{ screenshots: { filePath: string; elementRef: string; elementMeta: any; route: string; highlightRegion?: { x: number; y: number; width: number; height: number; } | undefined; }[]; metadata?: { baseUrl: string; timestamp: string; } | undefined; }>
```

### `resolveUrl`

```ts
/**
 * Resolve a potentially relative URL to an absolute one.
 * When storage is proxied, prepareUpload returns relative URLs like `/api/storage/upload/:id`.
 */
export function resolveUrl(url: string, apiUrl: string): string
```

### `uploadScreenshots`

```ts
/**
 * Upload screenshots and return IMAGE context data list.
 * Flow: prepareUpload → PUT file → finishUpload → collect context entries.
 */
export async function uploadScreenshots(screenshots: CapturedScreenshot[], options: UploadOptions): Promise<{ elementMeta: unknown; type: "IMAGE"; data: { fileId: number; highlightRegion?: { x: number; y: number; width: number; height: number; }; }; }[]>
```

### `addImageContexts`

```ts
/**
 * Add IMAGE contexts to existing elements via collection.addContexts endpoint.
 */
export async function addImageContexts(contexts: { elementMeta: unknown; type: "IMAGE"; data: { fileId: number; highlightRegion?: { x: number; y: number; width: number; height: number; }; }; }[], options: UploadOptions): Promise<{ addedCount: number; }>
```

## Type Index

* `AuthOptions` (interface)

* `CaptureOptions` (interface)

* `ScreenshotRoute` (interface) — Screenshot route configuration — describes a page to screenshot.

* `CapturedScreenshot` (interface) — Captured screenshot info — local file info and associated element for a single screenshot.

* `ScreenshotCollectOptions` (interface) — Screenshot collection options.

* `UploadOptions` (interface) — Upload options — for uploading screenshots to the platform.
