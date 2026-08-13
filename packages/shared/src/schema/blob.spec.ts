import { describe, expect, it } from "vitest";

import { BlobSchema } from "#/schema/drizzle/file.ts";

describe("BlobSchema", () => {
  it("validates binary hashes without requiring a Node Buffer global", () => {
    const blob = {
      id: 1,
      key: "source.json",
      storageProvider: {
        pluginId: "storage",
        serviceId: "primary",
        serviceType: "STORAGE_PROVIDER",
        scopeType: "GLOBAL",
        scopeId: "",
      },
      referenceCount: 1,
      hash: new Uint8Array([1, 2, 3]),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    expect(BlobSchema.parse(blob)).toEqual(blob);
    expect(BlobSchema.safeParse({ ...blob, hash: "not-binary" }).success).toBe(
      false,
    );
  });
});
