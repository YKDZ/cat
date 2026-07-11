import { describe, expect, it } from "vitest";

import {
  corepackInstallArgs,
  parsePackageManagerPin,
} from "./package-manager-pin.ts";

describe("package manager integrity pin", () => {
  it("accepts only an exact pnpm version with a complete sha512", () => {
    const integrity = `sha512.${"a".repeat(128)}`;

    expect(parsePackageManagerPin(`pnpm@11.11.0+${integrity}`)).toEqual({
      integrity,
      name: "pnpm",
      spec: `pnpm@11.11.0+${integrity}`,
      version: "11.11.0",
    });
    expect(() => parsePackageManagerPin("pnpm@11.11.0")).toThrow(
      "exact pnpm version and sha512",
    );
    expect(() =>
      parsePackageManagerPin(`pnpm@11.11.0+sha512.${"0".repeat(127)}`),
    ).toThrow("exact pnpm version and sha512");
  });

  it("passes a plausible but incorrect hash to Corepack instead of discarding it", () => {
    const spec = `pnpm@11.11.0+sha512.${"0".repeat(128)}`;

    expect(corepackInstallArgs(parsePackageManagerPin(spec))).toEqual([
      "install",
      "--global",
      spec,
    ]);
  });
});
