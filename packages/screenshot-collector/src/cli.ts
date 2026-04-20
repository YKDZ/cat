#!/usr/bin/env node

// oxlint-disable no-console
// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- CLI JSON parsing requires casting
import type { CollectionPayload } from "@cat/shared/schema/collection";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { collectScreenshots } from "./screenshot.ts";
import { addImageContexts, uploadScreenshots } from "./upload.ts";

const HELP = `
screenshot-collector — CAT Screenshot Context Collector

Usage: screenshot-collector collect [options]

Commands:
  collect    Capture screenshots and output CollectionPayload with IMAGE contexts

Options:
  --base-url <url>          Application base URL (e.g. http://localhost:3000)
  --routes <path>           Route config JSON file path
  --elements <path>         source-collector output CollectionPayload JSON file path
  --output-dir <path>       Screenshot output directory (default: ./screenshots)
  --project-id <uuid>       Target project ID (required for upload)
  --document-name <name>    Document name (required for upload)
  --api-url <url>           Platform API URL (default: http://localhost:3000)
  --api-key <key>           API Key (or set CAT_API_KEY env var)
  --upload                  Upload screenshots and add contexts to platform
  --headless                Use headless mode (default: true)
  --no-headless             Use headed mode (for debugging)
  -h, --help                Show help

Examples:
  # Collect screenshots locally, output CollectionPayload JSON
  screenshot-collector collect \\
    --base-url http://localhost:3000 \\
    --routes routes.json \\
    --elements source-payload.json \\
    --output-dir ./screenshots

  # Collect, upload, and add contexts
  screenshot-collector collect \\
    --base-url http://localhost:3000 \\
    --routes routes.json \\
    --elements source-payload.json \\
    --project-id 00000000-0000-0000-0000-000000000001 \\
    --document-name "app-i18n" \\
    --api-key cat_xxx \\
    --upload
`;

const main = async () => {
  const { positionals, values } = parseArgs({
    options: {
      "base-url": { type: "string" },
      routes: { type: "string" },
      elements: { type: "string" },
      "output-dir": { type: "string", default: "./screenshots" },
      "project-id": { type: "string" },
      "document-name": { type: "string" },
      "api-url": { type: "string" },
      "api-key": { type: "string" },
      upload: { type: "boolean", default: false },
      headless: { type: "boolean", default: true },
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

  if (command !== "collect") {
    console.error(
      `[ERROR] UNKNOWN_COMMAND: '${command}' is not a valid command.\n` +
        `  hint: Available commands: collect. Run 'screenshot-collector --help' for usage.`,
    );
    process.exit(1);
  }

  // Validate required options
  const rawBaseUrl = values["base-url"];
  if (typeof rawBaseUrl !== "string" || !rawBaseUrl) {
    console.error(
      "[ERROR] MISSING_OPTION: --base-url is required.\n" +
        "  hint: Specify the application base URL, e.g. --base-url http://localhost:3000",
    );
    process.exit(1);
  }

  const rawRoutes = values.routes;
  if (typeof rawRoutes !== "string" || !rawRoutes) {
    console.error(
      "[ERROR] MISSING_OPTION: --routes is required.\n" +
        "  hint: Specify the path to the routes JSON file.",
    );
    process.exit(1);
  }

  const rawElements = values.elements;
  if (typeof rawElements !== "string" || !rawElements) {
    console.error(
      "[ERROR] MISSING_OPTION: --elements is required.\n" +
        "  hint: Specify the path to the source-collector output JSON file.",
    );
    process.exit(1);
  }

  // Read routes config
  const routesContent = await readFile(resolve(rawRoutes), "utf-8");
  const routes = JSON.parse(routesContent) as {
    path: string;
    waitAfterLoad?: number;
  }[];

  // Read elements from source-collector payload
  const elementsContent = await readFile(resolve(rawElements), "utf-8");
  const sourcePayload = JSON.parse(elementsContent) as CollectionPayload;

  const outputDir = resolve(
    typeof values["output-dir"] === "string"
      ? values["output-dir"]
      : "./screenshots",
  );

  const headless = values.headless !== false;

  // Collect screenshots
  console.error(`[INFO] Starting screenshot collection...`);
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

    // Update contexts with real fileIds for output
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

  // Output CollectionPayload JSON to stdout (per spec)
  const outputPayload: CollectionPayload = {
    projectId: sourcePayload.projectId,
    sourceLanguageId: sourcePayload.sourceLanguageId,
    document: sourcePayload.document,
    elements: [], // screenshots don't add new elements
    contexts: imageContexts,
  };

  process.stdout.write(JSON.stringify(outputPayload, null, 2) + "\n");
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
