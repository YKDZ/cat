import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { createSandbox, safeCustomElements } from "@cat/plugin-core/client";
import { beforeAll, describe, expect, it } from "vitest";
import * as Vue from "vue";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "../../../../..");

beforeAll(async () => {
  await execFileAsync(
    "pnpm",
    ["--filter", "@cat-plugin/totp-mfa-provider", "build"],
    { cwd: root },
  );
}, 30_000);

describe("TOTP browser component artifacts", () => {
  it.each(["user-init-totp", "user-verify-totp"])(
    "registers %s through the host sandbox evaluator",
    async (componentName) => {
      const registry = new Map<
        string,
        {
          constructor: CustomElementConstructor;
          options?: ElementDefinitionOptions;
        }
      >();
      const code = await readFile(
        resolve(
          root,
          "@cat-plugin/totp-mfa-provider/dist",
          `${componentName}.js`,
        ),
        "utf8",
      );
      const sandbox = createSandbox("totp-mfa-provider", window, {
        globalContextBuilder: () => ({
          Vue: { ...Vue },
          console: window.console,
          customElements: safeCustomElements(registry),
          fetch: window.fetch,
        }),
      });

      sandbox.evaluate(code);

      expect(registry.get(componentName)?.constructor).toBeTypeOf("function");
      expect(registry.size).toBe(1);
    },
  );
});
