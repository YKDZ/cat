import { describe, expect, it, vi } from "vitest";

import {
  EnsureVectorStorageSchemaCommandSchema,
  ensureVectorStorageSchema,
} from "./ensure-vector-storage-schema.cmd.ts";

describe("ensureVectorStorageSchema", () => {
  it("attests a prepared vector schema without issuing DDL", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ typmod: 1024 }] });

    await expect(
      ensureVectorStorageSchema({ db: { execute } } as never, {
        dimension: 1024,
      }),
    ).resolves.toEqual({ events: [], result: undefined });

    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      queryChunks: [
        {
          value: [expect.stringContaining("n.nspname = current_schema()")],
        },
      ],
    });
    expect(execute.mock.calls[0]?.[0]).not.toMatchObject({
      queryChunks: [
        {
          value: [expect.stringMatching(/CREATE|ALTER|DROP/i)],
        },
      ],
    });
  });

  it("fails closed when the current schema does not contain the vector table", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });

    await expect(
      ensureVectorStorageSchema({ db: { execute } } as never, {
        dimension: 1024,
      }),
    ).rejects.toThrow(/Run schema preparation/);

    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      queryChunks: [
        {
          value: [expect.stringContaining("n.nspname = current_schema()")],
        },
      ],
    });
  });

  it("fails closed when the prepared current schema has another dimension", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ typmod: 1536 }] });

    await expect(
      ensureVectorStorageSchema({ db: { execute } } as never, {
        dimension: 1024,
      }),
    ).rejects.toThrow(
      "Vector schema dimension 1536 does not match the fixed vector dimension 1024. CAT requires a prepared vector(1024) schema and a vectorizer configured to output 1024 dimensions.",
    );
  });

  it("rejects a non-fixed dimension at the command boundary", () => {
    expect(
      EnsureVectorStorageSchemaCommandSchema.safeParse({ dimension: 1536 })
        .success,
    ).toBe(false);
  });

  it("binds identically named relation lookup to the current schema", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });

    await expect(
      ensureVectorStorageSchema({ db: { execute } } as never, {
        dimension: 1024,
      }),
    ).rejects.toThrow(/Vector schema is missing/);

    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      queryChunks: [
        {
          value: [
            expect.stringMatching(
              /n\.nspname = current_schema\(\)[\s\S]*c\.relname = 'Vector'/,
            ),
          ],
        },
      ],
    });
  });

  it("requires the visible Vector relation to be an ordinary table", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });

    await expect(
      ensureVectorStorageSchema({ db: { execute } } as never, {
        dimension: 1024,
      }),
    ).rejects.toThrow(/Vector schema is missing/);

    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      queryChunks: [
        {
          value: [expect.stringContaining("c.relkind = 'r'")],
        },
      ],
    });
  });
});
