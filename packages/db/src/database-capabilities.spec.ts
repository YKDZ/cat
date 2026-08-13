import { describe, expect, it, vi } from "vitest";

import {
  prepareDatabaseCapabilities,
  prepareVectorRuntimeSchema,
} from "./database-capabilities.ts";

const statements = [
  "CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public",
  "ALTER EXTENSION vector SET SCHEMA public",
  "CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public",
  "ALTER EXTENSION pg_trgm SET SCHEMA public",
] as const;

describe("database capability preparation", () => {
  it("installs required extensions into the shared public schema", async () => {
    const query = vi.fn(async (_statement: string) => undefined);

    await prepareDatabaseCapabilities({ query });

    expect(query.mock.calls.map(([statement]) => statement)).toEqual(
      statements,
    );
  });

  it.each(["23505", "42710"])(
    "retries a concurrent extension installation after SQLSTATE %s",
    async (code) => {
      const concurrentInstall = Object.assign(new Error("install raced"), {
        code,
      });
      const query = vi
        .fn<(statement: string) => Promise<void>>()
        .mockRejectedValueOnce(concurrentInstall)
        .mockResolvedValue(undefined);

      await prepareDatabaseCapabilities({ query });

      expect(query.mock.calls.map(([statement]) => statement)).toEqual([
        statements[0],
        ...statements,
      ]);
    },
  );

  it("preserves an unexpected database preparation failure", async () => {
    const failure = new Error("extension is unavailable");
    const query = vi.fn(async () => {
      throw failure;
    });

    await expect(prepareDatabaseCapabilities({ query })).rejects.toBe(failure);
    expect(query).toHaveBeenCalledOnce();
  });

  it("prepares the fixed vector runtime schema after the base schema", async () => {
    const query = vi.fn(async (statement: string): Promise<unknown> =>
      statement === "SELECT current_schema() AS schema_name"
        ? { rows: [{ schema_name: "test_schema" }] }
        : undefined,
    );

    await prepareVectorRuntimeSchema({ query });

    expect(
      query.mock.calls.map(([statement]) =>
        statement.replace(/\s+/g, " ").trim(),
      ),
    ).toEqual([
      "SELECT current_schema() AS schema_name",
      `CREATE TABLE IF NOT EXISTS "test_schema"."Vector" ( "id" serial PRIMARY KEY, "vector" public.vector(1024) NOT NULL, "chunk_id" integer NOT NULL REFERENCES "test_schema"."Chunk"("id") ON DELETE CASCADE ON UPDATE CASCADE )`,
      `CREATE INDEX IF NOT EXISTS "embeddingIndex" ON "test_schema"."Vector" USING hnsw ("vector" public.vector_cosine_ops)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Vector_chunkId_unique" ON "test_schema"."Vector" ("chunk_id")`,
    ]);
  });

  it("rejects vector schema preparation without a current schema", async () => {
    const query = vi.fn(async () => ({ rows: [{ schema_name: null }] }));

    await expect(prepareVectorRuntimeSchema({ query })).rejects.toThrow(
      /current database schema is unavailable/,
    );
    expect(query).toHaveBeenCalledOnce();
  });
});
