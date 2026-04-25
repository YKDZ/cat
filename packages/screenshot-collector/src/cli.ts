#!/usr/bin/env node

// oxlint-disable no-console
// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- CLI JSON parsing requires casting
import type { CollectionPayload } from "@cat/shared";

import { CollectionPayloadSchema } from "@cat/shared";
import { CaptureResultSchema, ExtractionResultSchema } from "@cat/shared";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { loadBindings, loadRouteManifest, resolveRoutes } from "./route.ts";
import { captureScreenshots, collectScreenshots } from "./screenshot.ts";
import { addImageContexts, uploadScreenshots } from "./upload.ts";

const HELP = `
screenshot-collector — CAT Screenshot Context Collector

Usage: screenshot-collector <command> [options]

Commands:
  capture    Capture screenshots locally (ExtractionResult input → CaptureResult output)
  upload     Upload CaptureResult screenshots to platform
  collect    Legacy: capture + optional upload (CollectionPayload compat)

capture Options:
  --base-url <url>              Application base URL
  --routes <path>               Route manifest JSON/YAML file
  --bindings <path>             Bindings JSON file (overrides route file bindings)
  --elements <path>             ExtractionResult JSON file
  --output-dir <path>           Screenshot output directory (default: ./screenshots)
  --headless / --no-headless    Headless mode (default: true)
  --output, -o <path>           CaptureResult JSON output (default: stdout)
  --auth-email <email>          Login email (or CAT_AUTH_EMAIL env var)
  --auth-password <password>    Login password (or CAT_AUTH_PASSWORD env var)
  --auth-storage-state <path>   Playwright storage state file

upload Options:
  --capture <path>              CaptureResult JSON file
  --project-id <uuid>           Target project ID
  --document-name <name>        Document name
  --api-url <url>               Platform API URL (default: http://localhost:3000)
  --api-key <key>               API Key (or CAT_API_KEY env var)

collect Options: (legacy, all existing options preserved)
  --base-url <url>              Application base URL
  --routes <path>               Route config file
  --elements <path>             CollectionPayload JSON file
  --output-dir <path>           Screenshot output directory (default: ./screenshots)
  --project-id <uuid>           Target project ID (required for --upload)
  --document-name <name>        Document name (required for --upload)
  --api-url <url>               Platform API URL (default: http://localhost:3000)
  --api-key <key>               API Key (or CAT_API_KEY env var)
  --upload                      Upload screenshots and add contexts
  --headless / --no-headless

  -h, --help                    Show help
`;

function requireStringOpt(
  values: Record<string, unknown>,
  name: string,
  hint: string,
): string {
  const val = values[name];
  if (typeof val !== "string" || !val) {
    console.error(
      `[ERROR] MISSING_OPTION: --${name} is required.\n  hint: ${hint}`,
    );
    process.exit(1);
  }
  return val;
}

async function runCapture(values: Record<string, unknown>): Promise<void> {
  const baseUrl = requireStringOpt(
    values,
    "base-url",
    "Specify the application base URL",
  );
  const rawRoutes = requireStringOpt(
    values,
    "routes",
    "Specify the routes manifest file path",
  );
  const rawElements = requireStringOpt(
    values,
    "elements",
    "Specify the ExtractionResult JSON file path",
  );

  // Load routes manifest
  const manifest = await loadRouteManifest(rawRoutes);

  // Load optional CLI bindings
  let cliBindings: Record<string, string> | undefined;
  if (typeof values.bindings === "string") {
    cliBindings = await loadBindings(values.bindings);
  }

  // Resolve routes
  const routes = resolveRoutes(manifest, cliBindings);

  // Load elements (ExtractionResult format — validated with Zod)
  const elementsContent = await readFile(resolve(rawElements), "utf-8");
  const extractionResult = ExtractionResultSchema.parse(
    JSON.parse(elementsContent),
  );

  const outputDir = resolve(
    typeof values["output-dir"] === "string"
      ? values["output-dir"]
      : "./screenshots",
  );
  const headless = values.headless !== false;

  // Auth options
  const authEmail =
    (typeof values["auth-email"] === "string" ? values["auth-email"] : null) ??
    process.env["CAT_AUTH_EMAIL"];
  const authPassword =
    (typeof values["auth-password"] === "string"
      ? values["auth-password"]
      : null) ?? process.env["CAT_AUTH_PASSWORD"];
  const authStorageState =
    typeof values["auth-storage-state"] === "string"
      ? values["auth-storage-state"]
      : undefined;

  console.error("[INFO] Starting screenshot capture...");
  const result = await captureScreenshots({
    baseUrl,
    routes,
    elements: extractionResult.elements,
    outputDir,
    headless,
    auth: {
      email: authEmail ?? undefined,
      password: authPassword ?? undefined,
      storageStatePath: authStorageState,
    },
  });

  console.error(
    `[INFO] Captured ${result.screenshots.length} screenshots to ${outputDir}`,
  );

  const json = JSON.stringify(result, null, 2);
  if (typeof values.output === "string") {
    await writeFile(values.output, json, "utf-8");
    console.error(`[INFO] CaptureResult written to ${values.output}`);
  } else {
    process.stdout.write(json + "\n");
  }
}

async function runUpload(values: Record<string, unknown>): Promise<void> {
  const capturePath = requireStringOpt(
    values,
    "capture",
    "Specify the CaptureResult JSON file",
  );
  const projectId = requireStringOpt(
    values,
    "project-id",
    "Specify the target project ID",
  );
  const documentName = requireStringOpt(
    values,
    "document-name",
    "Specify the document name",
  );

  const apiKey =
    (typeof values["api-key"] === "string" ? values["api-key"] : null) ??
    process.env["CAT_API_KEY"] ??
    "";
  if (!apiKey) {
    console.error(
      "[ERROR] MISSING_OPTION: --api-key is required.\n  hint: Set --api-key or export CAT_API_KEY",
    );
    process.exit(1);
  }

  const apiUrl =
    typeof values["api-url"] === "string"
      ? values["api-url"]
      : "http://localhost:3000";

  // Load CaptureResult (validated with Zod)
  const captureContent = await readFile(resolve(capturePath), "utf-8");
  const captureResult = CaptureResultSchema.parse(JSON.parse(captureContent));

  // Convert CaptureResult screenshots to CapturedScreenshot format for uploadScreenshots()
  const captured = captureResult.screenshots.map((s) => ({
    filePath: s.filePath,
    element: {
      ref: s.elementRef,
      text: "", // not needed for upload, meta is used for matching
      meta: s.elementMeta,
    },
    highlightRegion: s.highlightRegion,
  }));

  const uploadOpts = { apiUrl, apiKey, projectId, documentName };
  const uploadedContexts = await uploadScreenshots(captured, uploadOpts);
  const result = await addImageContexts(uploadedContexts, uploadOpts);

  console.error(
    `[INFO] Uploaded ${result.addedCount} IMAGE contexts to platform`,
  );
}

async function runCollect(values: Record<string, unknown>): Promise<void> {
  // Legacy collect — same interface as before
  const rawBaseUrl = requireStringOpt(
    values,
    "base-url",
    "Specify the application base URL",
  );
  const rawRoutes = requireStringOpt(
    values,
    "routes",
    "Specify the routes config file path",
  );
  const rawElements = requireStringOpt(
    values,
    "elements",
    "Specify the source-collector output JSON file",
  );

  // Read routes config — support both new and legacy formats
  const manifest = await loadRouteManifest(rawRoutes);

  // Load optional CLI bindings
  let cliBindings: Record<string, string> | undefined;
  if (typeof values.bindings === "string") {
    cliBindings = await loadBindings(values.bindings);
  }

  const routes = resolveRoutes(manifest, cliBindings);

  // Read elements from CollectionPayload (legacy format — validated with Zod)
  const elementsContent = await readFile(resolve(rawElements), "utf-8");
  const sourcePayload = CollectionPayloadSchema.parse(
    JSON.parse(elementsContent),
  );

  const outputDir = resolve(
    typeof values["output-dir"] === "string"
      ? values["output-dir"]
      : "./screenshots",
  );
  const headless = values.headless !== false;

  // Collect screenshots using legacy collectScreenshots
  console.error("[INFO] Starting screenshot collection...");
  const captured = await collectScreenshots({
    baseUrl: rawBaseUrl,
    routes,
    elements: sourcePayload.elements,
    outputDir,
    headless,
  });

  console.error(
    `[INFO] Captured ${captured.length} screenshots to ${outputDir}`,
  );

  // Build IMAGE contexts for output payload
  let imageContexts: CollectionPayload["contexts"] = captured.map((c) => ({
    elementRef: c.element.ref,
    type: "IMAGE" as const,
    data: {
      fileId: 0, // placeholder — will be filled after upload
      highlightRegion: c.highlightRegion,
    },
  }));

  // Optionally upload and add contexts
  if (values.upload) {
    const rawProjectId = values["project-id"];
    if (typeof rawProjectId !== "string" || !rawProjectId) {
      console.error(
        "[ERROR] MISSING_OPTION: --project-id is required when --upload is set.",
      );
      process.exit(1);
    }

    const rawDocumentName = values["document-name"];
    if (typeof rawDocumentName !== "string" || !rawDocumentName) {
      console.error(
        "[ERROR] MISSING_OPTION: --document-name is required when --upload is set.",
      );
      process.exit(1);
    }

    const apiKey =
      (typeof values["api-key"] === "string" ? values["api-key"] : null) ??
      process.env["CAT_API_KEY"] ??
      "";

    if (!apiKey) {
      console.error(
        "[ERROR] MISSING_OPTION: --api-key is required when --upload is set.\n" +
          "  hint: Set --api-key <key> or export CAT_API_KEY=cat_...",
      );
      process.exit(1);
    }

    const apiUrl =
      typeof values["api-url"] === "string"
        ? values["api-url"]
        : "http://localhost:3000";

    const uploadOpts = {
      apiUrl,
      apiKey,
      projectId: rawProjectId,
      documentName: rawDocumentName,
    };

    const uploadedContexts = await uploadScreenshots(captured, uploadOpts);
    const result = await addImageContexts(uploadedContexts, uploadOpts);

    console.error(
      `[INFO] Uploaded ${result.addedCount} IMAGE contexts to platform`,
    );

    imageContexts = uploadedContexts.map((uc) => ({
      elementRef:
        captured.find((c) => c.element.meta === uc.elementMeta)?.element.ref ??
        "",
      type: "IMAGE" as const,
      data: {
        fileId: uc.data.fileId,
        highlightRegion: uc.data.highlightRegion,
      },
    }));
  }

  // Output CollectionPayload JSON to stdout
  const outputPayload: CollectionPayload = {
    projectId: sourcePayload.projectId,
    sourceLanguageId: sourcePayload.sourceLanguageId,
    document: sourcePayload.document,
    elements: [], // screenshots don't add new elements
    contexts: imageContexts,
  };

  process.stdout.write(JSON.stringify(outputPayload, null, 2) + "\n");
}

const main = async () => {
  const { positionals, values } = parseArgs({
    options: {
      "base-url": { type: "string" },
      routes: { type: "string" },
      bindings: { type: "string" },
      elements: { type: "string" },
      "output-dir": { type: "string", default: "./screenshots" },
      "project-id": { type: "string" },
      "document-name": { type: "string" },
      "api-url": { type: "string" },
      "api-key": { type: "string" },
      capture: { type: "string" },
      upload: { type: "boolean", default: false },
      headless: { type: "boolean", default: true },
      output: { type: "string", short: "o" },
      "auth-email": { type: "string" },
      "auth-password": { type: "string" },
      "auth-storage-state": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help || positionals.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  const [command] = positionals;

  switch (command) {
    case "capture":
      await runCapture(values);
      break;
    case "upload":
      await runUpload(values);
      break;
    case "collect":
      await runCollect(values);
      break;
    default:
      console.error(
        `[ERROR] UNKNOWN_COMMAND: '${command}' is not a valid command.\n` +
          `  hint: Available commands: capture, upload, collect. Run 'screenshot-collector --help' for usage.`,
      );
      process.exit(1);
  }
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
