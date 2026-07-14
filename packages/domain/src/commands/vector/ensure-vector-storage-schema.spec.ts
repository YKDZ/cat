import { describe, expect, it, vi } from "vitest";

import { ensureVectorStorageSchema } from "./ensure-vector-storage-schema.cmd.ts";

describe("ensureVectorStorageSchema", () => {
  it("attests a prepared vector schema without issuing DDL", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ typmod: 1024 }] });

    await expect(
      ensureVectorStorageSchema({ db: { execute } } as never, {
        dimension: 1024,
      }),
    ).resolves.toEqual({ events: [], result: undefined });

    expect(execute).toHaveBeenCalledOnce();
    expect(String(execute.mock.calls[0]?.[0])).not.toMatch(
      /CREATE|ALTER|DROP/i,
    );
  });

  it("fails closed when schema preparation did not create the vector table", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });

    await expect(
      ensureVectorStorageSchema({ db: { execute } } as never, {
        dimension: 1024,
      }),
    ).rejects.toThrow(/Run schema preparation/);
  });
});
