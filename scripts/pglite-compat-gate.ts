import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assessDatabaseRequirements,
  type DatabaseRequirementDb,
} from "@cat/domain";
import {
  DatabaseRequirementAssessmentSchema,
  type DatabaseRequirementSet,
} from "@cat/shared";

type QueryableDatabase = {
  close?: () => Promise<void> | void;
  query: (statement: string) => Promise<{ rows: unknown[] }>;
};

export type PgliteGateReport = {
  passed: boolean;
  requirements: DatabaseRequirementSet;
};

const isExecutedDirectly = (): boolean => {
  const entryPath = process.argv[1];
  return (
    entryPath !== undefined &&
    fileURLToPath(import.meta.url) === resolve(entryPath)
  );
};

const asRequirementDb = (
  database: QueryableDatabase,
): DatabaseRequirementDb => ({
  execute: async (statement: string) => {
    const result = await database.query(statement);
    return { rows: result.rows as Record<string, unknown>[] };
  },
});

export const evaluatePgliteGate = (assessment: unknown): PgliteGateReport => {
  const parsed = DatabaseRequirementAssessmentSchema.parse(assessment);
  return {
    passed: parsed.requirements.some(
      ({ id, status }) => id === "POSTGRESQL_CORE" && status === "SATISFIED",
    ),
    requirements: parsed.requirements,
  };
};

export const pgliteGateExitCode = (report: PgliteGateReport): 0 | 1 =>
  report.passed ? 0 : 1;

const formatRequirements = (requirements: DatabaseRequirementSet): string =>
  requirements.map(({ id, status }) => `${id}=${status}`).join(" ");

export const formatPgliteGateSuccess = (report: PgliteGateReport): string =>
  `pglite compatibility reported ${formatRequirements(report.requirements)}`;

export const formatPgliteGateFailure = (report: PgliteGateReport): string =>
  `pglite compatibility failed ${formatRequirements(report.requirements)}`;

/** Run the CAT assessment unchanged against PGlite without creating extensions or objects. */
export const runPgliteCompatGate = async (): Promise<PgliteGateReport> => {
  let PGlite: typeof import("@electric-sql/pglite").PGlite;
  try {
    ({ PGlite } = await import("@electric-sql/pglite"));
  } catch {
    return evaluatePgliteGate({
      requirements: [
        {
          blocker: { reason: "PROBE_UNCLASSIFIED" },
          id: "POSTGRESQL_CORE",
          status: "UNKNOWN",
        },
        {
          blocker: { reason: "PROBE_UNCLASSIFIED" },
          id: "POSTGRESQL_TRIGRAM_MATCHING",
          status: "UNKNOWN",
        },
        {
          blocker: { reason: "PROBE_UNCLASSIFIED" },
          id: "POSTGRESQL_VECTOR_STORAGE",
          status: "UNKNOWN",
        },
      ],
    });
  }

  const database = new PGlite() as QueryableDatabase;
  try {
    return evaluatePgliteGate(
      await assessDatabaseRequirements(asRequirementDb(database)),
    );
  } finally {
    await database.close?.();
  }
};

const main = async (): Promise<void> => {
  const report = await runPgliteCompatGate();
  const output = report.passed
    ? formatPgliteGateSuccess(report)
    : formatPgliteGateFailure(report);
  (report.passed ? process.stdout : process.stderr).write(`${output}\n`);
  process.exitCode = pgliteGateExitCode(report);
};

if (isExecutedDirectly()) await main();
