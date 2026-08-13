import { randomUUID } from "node:crypto";

import {
  languageAnalysisObservation,
  relations,
  type DrizzleClient,
} from "@cat/db";
import {
  LanguageAnalysisRequirementAssessmentSchema,
  LanguageAnalysisPolicySnapshotSchema,
  LanguageAnalysisSelectionFingerprintSchema,
  LanguageAnalysisWildcardSelectionKey,
  normalizeLanguageId,
  ServiceImplementationReferenceSchema,
  toLanguageAnalysisSelectionKey,
  type LanguageAnalysisObservation,
  type LanguageAnalysisSelection,
  type LanguageAnalysisSelectionKey,
} from "@cat/shared";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  assertLanguageAnalysisPolicySnapshot,
  StaleLanguageAnalysisPolicySnapshotError,
  StaleLanguageAnalysisObservationError,
  writeLanguageAnalysisObservation,
  writeValidatedLanguageAnalysisSelection,
} from "#/commands/index.ts";
import { executeCommand, executeQuery } from "#/executor.ts";
import {
  readLanguageAnalysisObservation,
  resolveLanguageAnalysisSelection,
} from "#/queries/index.ts";
type PolicyTestDb = {
  client: DrizzleClient;
  cleanup: () => Promise<void>;
  openConcurrentClient: () => Promise<{
    client: DrizzleClient;
    cleanup: () => Promise<void>;
  }>;
};

let testDb: PolicyTestDb;

const implementation = ServiceImplementationReferenceSchema.parse({
  pluginId: "policy-concurrency-analyzer",
  serviceId: "analyzer",
  serviceType: "LANGUAGE_ANALYZER",
  scopeType: "GLOBAL",
  scopeId: "",
});
const fingerprint = LanguageAnalysisSelectionFingerprintSchema.parse(
  `sha256:${"a".repeat(64)}`,
);
const changedFingerprint = LanguageAnalysisSelectionFingerprintSchema.parse(
  `sha256:${"b".repeat(64)}`,
);

const setupPolicyTestDb = async (): Promise<PolicyTestDb> => {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgres://user:pass@localhost:5432/cat";
  const admin = new Client({ connectionString });
  await admin.connect();
  const schema = `test_language_analysis_${randomUUID().replaceAll("-", "_")}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.query(`SET search_path TO "${schema}", public`);
  await admin.query(`
    CREATE TABLE "LanguageAnalysisPolicy" (
      id integer PRIMARY KEY,
      epoch integer NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    );
    CREATE TABLE "LanguageAnalysisSelection" (
      key text PRIMARY KEY,
      implementation jsonb,
      revision integer NOT NULL,
      configuration_fingerprint text,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    );
    CREATE TABLE "LanguageAnalysisObservation" (
      language_id text PRIMARY KEY,
      policy_epoch integer NOT NULL,
      selection_key text NOT NULL,
      selection_revision integer NOT NULL,
      configuration_fingerprint text NOT NULL,
      assessment jsonb NOT NULL,
      observed_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    );
    CREATE TABLE "RecallDerivationState" (
      id serial PRIMARY KEY,
      language_id text NOT NULL,
      status text NOT NULL,
      demand_revision integer NOT NULL,
      task_projection_revision integer NOT NULL DEFAULT 1,
      lease_owner_id uuid,
      lease_token uuid,
      lease_expires_at timestamptz,
      retry_count integer NOT NULL,
      next_attempt_at timestamptz,
      blocker jsonb,
      required_derivation_version text,
      updated_at timestamptz NOT NULL
    );
  `);
  const openConcurrentClient = async () => {
    const client = new Client({ connectionString });
    await client.connect();
    await client.query(`SET search_path TO "${schema}", public`);
    return {
      client: drizzle({ client, relations }) as DrizzleClient,
      cleanup: async () => await client.end(),
    };
  };
  return {
    client: drizzle({ client: admin, relations }) as DrizzleClient,
    openConcurrentClient,
    cleanup: async () => {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    },
  };
};

beforeAll(async () => {
  testDb = await setupPolicyTestDb();
});

afterAll(async () => {
  await testDb?.cleanup();
});

const writeSelection = async (
  db: DrizzleClient,
  key: LanguageAnalysisSelectionKey,
  expectedRevision: number,
  selected: boolean,
  selectedFingerprint = fingerprint,
): Promise<LanguageAnalysisSelection> =>
  await executeCommand({ db }, writeValidatedLanguageAnalysisSelection, {
    key,
    expectedRevision,
    implementation: selected ? implementation : null,
    configurationFingerprint: selected ? selectedFingerprint : null,
  });

const observationFor = async (
  db: DrizzleClient,
  languageId: ReturnType<typeof normalizeLanguageId>,
): Promise<LanguageAnalysisObservation> => {
  const resolved = await executeQuery(
    { db },
    resolveLanguageAnalysisSelection,
    { languageId },
  );
  const selection = resolved.selection;
  if (
    selection?.implementation === null ||
    selection === null ||
    selection.configurationFingerprint === null
  ) {
    throw new Error("Expected an effective selected implementation");
  }
  const assessedAt = new Date();
  const assessment = LanguageAnalysisRequirementAssessmentSchema.parse({
    status: "SATISFIED",
    languageId,
    policyEpoch: resolved.policyEpoch,
    selection,
    blocker: null,
    assessedAt,
  });
  return {
    languageId,
    policyEpoch: resolved.policyEpoch,
    selectionKey: selection.key,
    selectionRevision: selection.revision,
    configurationFingerprint: selection.configurationFingerprint,
    assessment,
    observedAt: assessedAt,
  };
};

const expectConcurrentExactPublicationRejected = async (
  language: string,
  seedTombstone: boolean,
): Promise<void> => {
  const languageId = normalizeLanguageId(language);
  const exactKey = toLanguageAnalysisSelectionKey(languageId);
  if (seedTombstone) {
    await writeSelection(testDb.client, exactKey, 0, false);
  }
  const staleObservation = await observationFor(testDb.client, languageId);
  const [mutationClient, publicationClient] = await Promise.all([
    testDb.openConcurrentClient(),
    testDb.openConcurrentClient(),
  ]);
  let mutationReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    mutationReady = resolve;
  });
  let releaseMutation!: () => void;
  const release = new Promise<void>((resolve) => {
    releaseMutation = resolve;
  });

  try {
    const mutation = mutationClient.client.transaction(async (tx) => {
      await writeSelection(tx, exactKey, seedTombstone ? 1 : 0, true);
      mutationReady();
      await release;
    });
    await ready;
    const publication = executeCommand(
      { db: publicationClient.client },
      writeLanguageAnalysisObservation,
      staleObservation,
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    releaseMutation();

    await mutation;
    await expect(publication).rejects.toBeInstanceOf(
      StaleLanguageAnalysisObservationError,
    );
    const rows = await testDb.client
      .select()
      .from(languageAnalysisObservation)
      .where(eq(languageAnalysisObservation.languageId, languageId));
    expect(rows).toHaveLength(0);
  } finally {
    releaseMutation();
    await Promise.all([mutationClient.cleanup(), publicationClient.cleanup()]);
  }
};

describe("Language Analysis policy publication", () => {
  test("rejects a stale canonical-write snapshot after a real PostgreSQL lock race", async () => {
    const snapshot = await executeQuery(
      { db: testDb.client },
      resolveLanguageAnalysisSelection,
      { languageId: normalizeLanguageId("en") },
    );
    const [mutationClient, canonicalWriteClient] = await Promise.all([
      testDb.openConcurrentClient(),
      testDb.openConcurrentClient(),
    ]);
    let mutationReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      mutationReady = resolve;
    });
    let releaseMutation!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseMutation = resolve;
    });

    try {
      const mutation = mutationClient.client.transaction(async (tx) => {
        await writeSelection(
          tx,
          toLanguageAnalysisSelectionKey(normalizeLanguageId("ja")),
          0,
          true,
          changedFingerprint,
        );
        mutationReady();
        await release;
      });
      await ready;
      const canonicalWrite = canonicalWriteClient.client.transaction(
        async (tx) =>
          await executeCommand(
            { db: tx },
            assertLanguageAnalysisPolicySnapshot,
            LanguageAnalysisPolicySnapshotSchema.parse({
              policyEpoch: snapshot.policyEpoch,
            }),
          ),
      );
      const staleSnapshotAssertion = expect(
        canonicalWrite,
      ).rejects.toBeInstanceOf(StaleLanguageAnalysisPolicySnapshotError);
      await new Promise((resolve) => setTimeout(resolve, 25));
      releaseMutation();
      await mutation;
      await staleSnapshotAssertion;
    } finally {
      releaseMutation();
      await Promise.all([
        mutationClient.cleanup(),
        canonicalWriteClient.cleanup(),
      ]);
    }
  });

  test("rejects wildcard publication racing the first exact insertion", async () => {
    await writeSelection(
      testDb.client,
      LanguageAnalysisWildcardSelectionKey,
      0,
      true,
    );
    await expectConcurrentExactPublicationRejected("en", false);
  });

  test("rejects wildcard publication racing an exact tombstone replacement", async () => {
    await expectConcurrentExactPublicationRejected("de", true);
  });

  test("returns UNKNOWN for expired observations and changed effective policy", async () => {
    const languageId = normalizeLanguageId("fr");
    const observation = await observationFor(testDb.client, languageId);
    await executeCommand(
      { db: testDb.client },
      writeLanguageAnalysisObservation,
      observation,
    );

    await expect(
      executeQuery({ db: testDb.client }, readLanguageAnalysisObservation, {
        languageId,
        ttlMs: 1,
        now: new Date(observation.observedAt.getTime() + 2),
      }),
    ).resolves.toMatchObject({
      assessment: { status: "UNKNOWN" },
      observation: null,
    });

    const wildcard = observation.assessment.selection;
    if (wildcard === null) throw new Error("Expected wildcard selection");
    await writeSelection(
      testDb.client,
      LanguageAnalysisWildcardSelectionKey,
      wildcard.revision,
      true,
      changedFingerprint,
    );
    await expect(
      executeQuery({ db: testDb.client }, readLanguageAnalysisObservation, {
        languageId,
        ttlMs: 60_000,
      }),
    ).resolves.toMatchObject({
      assessment: { status: "UNKNOWN" },
      observation: null,
      selection: { configurationFingerprint: changedFingerprint },
    });

    await writeSelection(
      testDb.client,
      toLanguageAnalysisSelectionKey(languageId),
      0,
      true,
    );
    await expect(
      executeQuery({ db: testDb.client }, readLanguageAnalysisObservation, {
        languageId,
        ttlMs: 60_000,
      }),
    ).resolves.toMatchObject({
      assessment: { status: "UNKNOWN" },
      observation: null,
      source: "EXACT",
      selection: { key: "fr", configurationFingerprint: fingerprint },
    });
  });
});
