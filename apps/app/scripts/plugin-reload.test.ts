import { execFile } from "node:child_process";
import { appendFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { WebSocket as NodeWebSocket } from "undici";
import { createServer, type ViteDevServer } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import { pluginDistReload } from "../src/config/plugin-dist-reload.ts";
import { watchPluginBuilds, type PluginBuildWatcher } from "./dev.ts";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "../../..");
const pluginRoot = resolve(root, "@cat-plugin");
const probe = resolve(
  pluginRoot,
  "tiny-widget/src/plugin-reload.integration-probe.ts",
);
const output = resolve(pluginRoot, "tiny-widget/dist/index.js");
const distributionProbe = resolve(
  pluginRoot,
  "tiny-widget/dist/plugin-reload.integration-probe.js",
);

let server: ViteDevServer | undefined;
let watcher: PluginBuildWatcher | undefined;
let socket: NodeWebSocket | undefined;

afterEach(async () => {
  socket?.close();
  await watcher?.close();
  await server?.close();
  await rm(probe, { force: true });
  await rm(distributionProbe, { force: true });
});

const waitForMessage = async <T>(
  target: NodeWebSocket,
  predicate: (value: unknown) => value is T,
): Promise<T> =>
  new Promise<T>((resolveMessage, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for Vite websocket message"));
    }, 15_000);
    target.addEventListener("message", (event) => {
      void (async () => {
        let text: string;
        if (typeof event.data === "string") {
          text = event.data;
        } else if (event.data instanceof Blob) {
          text = await event.data.text();
        } else if (event.data instanceof ArrayBuffer) {
          text = Buffer.from(event.data).toString("utf8");
        } else if (ArrayBuffer.isView(event.data)) {
          text = Buffer.from(
            event.data.buffer,
            event.data.byteOffset,
            event.data.byteLength,
          ).toString("utf8");
        } else {
          throw new Error("Unsupported Vite websocket message payload");
        }
        const value: unknown = JSON.parse(text);
        if (predicate(value)) {
          clearTimeout(timeout);
          resolveMessage(value);
        }
      })().catch((error: unknown) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  });

describe("plugin development reload", () => {
  it("rebuilds changed plugin source and sends a real Vite full reload", async () => {
    await execFileAsync(
      "pnpm",
      ["--filter", "@cat-plugin/tiny-widget", "build"],
      { cwd: root },
    );
    const before = await stat(output);

    server = await createServer({
      configFile: false,
      logLevel: "silent",
      plugins: [pluginDistReload(pluginRoot)],
      root: join(tmpdir(), "cat-vite-plugin-reload"),
      server: { host: "127.0.0.1", port: 0, strictPort: false },
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (
      address === null ||
      address === undefined ||
      typeof address === "string"
    ) {
      throw new Error("Vite did not expose a TCP address");
    }

    // Vite 8 requires this token for websocket clients that send an Origin.
    // oxlint-disable-next-line typescript/no-deprecated
    const webSocketToken = server.config.webSocketToken;
    socket = new NodeWebSocket(
      `ws://127.0.0.1:${address.port}?token=${webSocketToken}`,
      "vite-hmr",
    );
    await waitForMessage(
      socket,
      (value): value is { type: "connected" } =>
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "connected",
    );
    const reload = waitForMessage(
      socket,
      (value): value is { type: "full-reload" } =>
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "full-reload",
    );
    let resolveBuild: (() => void) | undefined;
    const rebuilt = new Promise<void>((resolveRebuild) => {
      resolveBuild = resolveRebuild;
    });
    watcher = watchPluginBuilds(
      async (pluginName) => {
        if (pluginName !== "tiny-widget") return;
        await execFileAsync(
          "pnpm",
          ["--filter", "@cat-plugin/tiny-widget", "build"],
          { cwd: root },
        );
        resolveBuild?.();
      },
      { debounceMs: 25, pluginRoot },
    );

    await writeFile(probe, "export const reloadProbe = true;\n");

    await rebuilt;
    await reload;
    const after = await stat(output);
    expect(after.mtimeMs).toBeGreaterThan(before.mtimeMs);

    const addReload = waitForMessage(
      socket,
      (value): value is { type: "full-reload" } =>
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "full-reload",
    );
    await writeFile(distributionProbe, "export const event = 1;\n");
    await addReload;

    const changeReload = waitForMessage(
      socket,
      (value): value is { type: "full-reload" } =>
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "full-reload",
    );
    await appendFile(distributionProbe, "export const changed = true;\n");
    await changeReload;

    const unlinkReload = waitForMessage(
      socket,
      (value): value is { type: "full-reload" } =>
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "full-reload",
    );
    await rm(distributionProbe);
    await unlinkReload;
  }, 30_000);
});
