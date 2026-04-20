import type { CollectionElement } from "@cat/shared/schema/collection";
import type { NavigationStep } from "@cat/shared/schema/extraction";

// Re-export so existing imports from this module still work
export type { NavigationStep };

/**
 * Screenshot route configuration — describes a page to screenshot.
 */
export interface ScreenshotRoute {
  /** Page URL path (relative to baseUrl). */
  path: string;
  /** Wait time after page load (ms), default 1000. */
  waitAfterLoad?: number;
  /** Playwright waitUntil strategy for goto(), default "networkidle". */
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  /** Optional navigation steps to execute before screenshotting. */
  steps?: NavigationStep[];
  /** Whether authentication is needed for this route (default: true). */
  auth?: boolean;
}

/**
 * Captured screenshot info — local file info and associated element for a single screenshot.
 */
export interface CapturedScreenshot {
  /** Local file path of the screenshot. */
  filePath: string;
  /** Associated element. */
  element: CollectionElement;
  /** Highlight region of the element in the screenshot. */
  highlightRegion?: { x: number; y: number; width: number; height: number };
}

/**
 * Screenshot collection options.
 */
export interface ScreenshotCollectOptions {
  /** Browser base URL, e.g. "http://localhost:3000". */
  baseUrl: string;
  /** Route configuration list. */
  routes: ScreenshotRoute[];
  /** Elements to screenshot (from source-collector output). */
  elements: CollectionElement[];
  /** Screenshot output directory. */
  outputDir: string;
  /** Whether to use headless mode, default true. */
  headless?: boolean;
}

/**
 * Upload options — for uploading screenshots to the platform.
 */
export interface UploadOptions {
  /** Platform API URL. */
  apiUrl: string;
  /** API Key. */
  apiKey: string;
  /** Project ID. */
  projectId: string;
  /** Document name. */
  documentName: string;
}
