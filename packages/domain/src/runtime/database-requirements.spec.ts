import { DatabaseRequirementAssessmentSchema } from "@cat/shared";
import { describe, expect, it, vi } from "vitest";

import {
  assertDatabaseRequirements,
  assessDatabaseRequirements,
  type DatabaseRequirementDb,
} from "./database-requirements.ts";

type QueryRows = Array<Record<string, unknown>>;

const createFakeDb = (responses: QueryRows[]): DatabaseRequirementDb => ({
  execute: vi.fn(async () => ({ rows: responses.shift() ?? [] })),
});

const readyVector = {
  dimension: 1024,
  has_chunk_foreign_key: true,
  has_cosine_behaviour: true,
  has_hnsw_index: true,
  has_not_null_chunk: true,
  has_unique_chunk_index: true,
  is_not_null: true,
};

const readyAssessment = {
  requirements: [
    { id: "POSTGRESQL_CORE", status: "SATISFIED" },
    { id: "POSTGRESQL_TRIGRAM_MATCHING", status: "SATISFIED" },
    { id: "POSTGRESQL_VECTOR_STORAGE", status: "SATISFIED" },
  ],
};

describe("database requirements", () => {
  it("reports only the three shared requirements after read-only behavioural probes", async () => {
    const db = createFakeDb([
      [{ version: "PostgreSQL 18.0" }],
      [
        { extname: "vector", extversion: "0.8.0" },
        { extname: "pg_trgm", extversion: "1.6" },
      ],
      [
        {
          has_similarity_operator: true,
          has_trigram_operator_family: true,
          score: 1,
        },
      ],
      [readyVector],
    ]);

    await expect(assessDatabaseRequirements(db)).resolves.toEqual(
      readyAssessment,
    );
    for (const [query] of vi.mocked(db.execute).mock.calls) {
      expect(query).not.toMatch(/CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TEMP/i);
    }
  });

  it("rejects missing, duplicate, or out-of-order assessment requirements", () => {
    expect(() =>
      DatabaseRequirementAssessmentSchema.parse({
        requirements: [
          { id: "POSTGRESQL_CORE", status: "SATISFIED" },
          { id: "POSTGRESQL_CORE", status: "SATISFIED" },
          { id: "POSTGRESQL_VECTOR_STORAGE", status: "SATISFIED" },
        ],
      }),
    ).toThrow();
    expect(() =>
      DatabaseRequirementAssessmentSchema.parse({
        requirements: [
          { id: "POSTGRESQL_TRIGRAM_MATCHING", status: "SATISFIED" },
          { id: "POSTGRESQL_CORE", status: "SATISFIED" },
          { id: "POSTGRESQL_VECTOR_STORAGE", status: "SATISFIED" },
        ],
      }),
    ).toThrow();
    expect(() =>
      DatabaseRequirementAssessmentSchema.parse({
        requirements: [
          { id: "POSTGRESQL_CORE", status: "SATISFIED" },
          { id: "POSTGRESQL_TRIGRAM_MATCHING", status: "SATISFIED" },
        ],
      }),
    ).toThrow();
    expect(() =>
      DatabaseRequirementAssessmentSchema.parse({
        requirements: [
          { id: "POSTGRESQL_CORE", status: "SATISFIED" },
          {
            blocker: { ignored: true, reason: "EXTENSION_MISSING" },
            id: "POSTGRESQL_TRIGRAM_MATCHING",
            status: "BLOCKED",
          },
          { id: "POSTGRESQL_VECTOR_STORAGE", status: "SATISFIED" },
        ],
      }),
    ).toThrow();
  });

  it("maps a confirmed missing operator capability to a typed blocker", async () => {
    const db: DatabaseRequirementDb = {
      execute: vi.fn(async (statement: string) => {
        if (statement.includes("similarity")) {
          throw Object.assign(new Error("operator does not exist"), {
            code: "42883",
          });
        }
        if (statement.includes("pg_extension")) {
          return {
            rows: [{ extname: "vector" }, { extname: "pg_trgm" }],
          };
        }
        return { rows: [readyVector] };
      }),
    };

    await expect(assessDatabaseRequirements(db)).resolves.toMatchObject({
      requirements: expect.arrayContaining([
        {
          blocker: { reason: "MISSING_CAPABILITY" },
          id: "POSTGRESQL_TRIGRAM_MATCHING",
          status: "BLOCKED",
        },
      ]),
    });
  });

  it("keeps missing vector cosine behaviour distinct from a schema blocker", async () => {
    const db = createFakeDb([
      [{ version: "PostgreSQL 18.0" }],
      [{ extname: "vector" }, { extname: "pg_trgm" }],
      [
        {
          has_similarity_operator: true,
          has_trigram_operator_family: true,
          score: 1,
        },
      ],
      [{ ...readyVector, has_cosine_behaviour: false }],
    ]);

    await expect(assessDatabaseRequirements(db)).resolves.toMatchObject({
      requirements: expect.arrayContaining([
        {
          blocker: { reason: "REQUIRED_BEHAVIOUR_MISSING" },
          id: "POSTGRESQL_VECTOR_STORAGE",
          status: "BLOCKED",
        },
      ]),
    });
  });

  it("marks an absent extension as a typed confirmed blocker", async () => {
    const db = createFakeDb([
      [{ version: "PostgreSQL 18.0" }],
      [{ extname: "vector" }],
      [readyVector],
    ]);

    await expect(assessDatabaseRequirements(db)).resolves.toMatchObject({
      requirements: expect.arrayContaining([
        {
          blocker: { reason: "EXTENSION_MISSING" },
          id: "POSTGRESQL_TRIGRAM_MATCHING",
          status: "BLOCKED",
        },
      ]),
    });
  });

  it.each([
    ["08006", "CONNECTION_UNAVAILABLE"],
    ["42501", "PERMISSION_DENIED"],
    ["57014", "QUERY_TIMEOUT"],
    ["XX000", "PROBE_UNCLASSIFIED"],
  ] as const)("maps SQLSTATE %s to UNKNOWN/%s", async (code, reason) => {
    const db: DatabaseRequirementDb = {
      execute: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error(code), { code })),
    };

    await expect(assessDatabaseRequirements(db)).resolves.toEqual({
      requirements: [
        { blocker: { reason }, id: "POSTGRESQL_CORE", status: "UNKNOWN" },
        {
          blocker: { reason },
          id: "POSTGRESQL_TRIGRAM_MATCHING",
          status: "UNKNOWN",
        },
        {
          blocker: { reason },
          id: "POSTGRESQL_VECTOR_STORAGE",
          status: "UNKNOWN",
        },
      ],
    });
  });

  it("hard fails startup for every non-satisfied requirement", async () => {
    const db = createFakeDb([
      [{ version: "PostgreSQL 18.0" }],
      [{ extname: "vector", extversion: "0.8.0" }],
      [readyVector],
    ]);

    await expect(assertDatabaseRequirements(db)).rejects.toThrow(
      /POSTGRESQL_TRIGRAM_MATCHING/i,
    );
  });
});
