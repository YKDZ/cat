# Screenshot Collector

> **Section**: Infra  ·  **Subject ID**: `infra/screenshot-collector`

**Primary package**: `@cat/screenshot-collector`

## API Reference

| Symbol | Kind | Description |
| ------ | ---- | ----------- |
| `authenticateBrowser` | function | Handle browser authentication.
If storageStatePath is provided and valid, restor |
| `AuthOptions` | interface |  |
| `loadRouteManifest` | function | Load a route manifest from a JSON or YAML file.
Supports both new RouteManifest  |
| `loadBindings` | function | Load bindings from a JSON file and validate. |
| `mergeBindings` | function | Merge bindings: file bindings as base, CLI bindings override. |
| `resolveRoutes` | function | Resolve a RouteManifest into concrete ScreenshotRoute[] by replacing $ref placeh |
| `collectScreenshots` | function | Collect screenshots: launch browser, traverse routes, locate elements and screen |
| `captureScreenshots` | function | Capture screenshots for elements across routes, returning CaptureResult.
Similar |
| `CaptureOptions` | interface |  |
| `ScreenshotRoute` | interface | Screenshot route configuration — describes a page to screenshot. |
| `CapturedScreenshot` | interface | Captured screenshot info — local file info and associated element for a single s |
| `ScreenshotCollectOptions` | interface | Screenshot collection options. |
| `UploadOptions` | interface | Upload options — for uploading screenshots to the platform. |
| `resolveUrl` | function | Resolve a potentially relative URL to an absolute one.
When storage is proxied,  |
| `uploadScreenshots` | function | Upload screenshots and return IMAGE context data list.
Flow: prepareUpload → PUT |
| `addImageContexts` | function | Add IMAGE contexts to existing elements via collection.addContexts endpoint. |
