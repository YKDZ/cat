import { describe, expect, it, vi } from "vitest";

import { resolveDisplayLanguage } from "./display-language.ts";

describe("resolveDisplayLanguage", () => {
  it("accepts only supported cookie values before consulting other sources", async () => {
    const readDeploymentDefault = vi.fn();

    await expect(
      resolveDisplayLanguage({
        cookie: "en_us",
        acceptLanguage: "zh-CN",
        readDeploymentDefault,
      }),
    ).resolves.toBe("en_us");
    expect(readDeploymentDefault).not.toHaveBeenCalled();
  });

  it("rejects malicious cookies and maps supported Accept-Language values", async () => {
    const readDeploymentDefault = vi.fn();

    await expect(
      resolveDisplayLanguage({
        cookie: "../../../../tmp/payload",
        acceptLanguage: "en-US,en;q=0.9",
        readDeploymentDefault,
      }),
    ).resolves.toBe("en_us");
    expect(readDeploymentDefault).not.toHaveBeenCalled();
  });

  it("falls back from unsupported headers and invalid deployment defaults", async () => {
    await expect(
      resolveDisplayLanguage({
        cookie: null,
        acceptLanguage: "fr-FR",
        readDeploymentDefault: async () => "../../secret",
      }),
    ).resolves.toBe("zh_cn");
  });
});
