import { describe, expect, it } from "vitest";

import {
  evaluatePgliteGate,
  formatPgliteGateSuccess,
  pgliteGateExitCode,
} from "./pglite-compat-gate.ts";

describe("pglite compatibility gate", () => {
  it("reports the same exact requirements without treating PGlite as a runtime", () => {
    const report = evaluatePgliteGate({
      requirements: [
        { id: "POSTGRESQL_CORE", status: "SATISFIED" },
        {
          blocker: { reason: "EXTENSION_MISSING" },
          id: "POSTGRESQL_TRIGRAM_MATCHING",
          status: "BLOCKED",
        },
        {
          blocker: { reason: "EXTENSION_MISSING" },
          id: "POSTGRESQL_VECTOR_STORAGE",
          status: "BLOCKED",
        },
      ],
    });

    expect(report.passed).toBe(true);
    expect(report.requirements).toHaveLength(3);
    expect(formatPgliteGateSuccess(report)).toBe(
      "pglite compatibility reported POSTGRESQL_CORE=SATISFIED POSTGRESQL_TRIGRAM_MATCHING=BLOCKED POSTGRESQL_VECTOR_STORAGE=BLOCKED",
    );
  });

  it("fails only when the shared assessment cannot establish PostgreSQL core", () => {
    const report = evaluatePgliteGate({
      requirements: [
        {
          blocker: { reason: "CONNECTION_UNAVAILABLE" },
          id: "POSTGRESQL_CORE",
          status: "UNKNOWN",
        },
        {
          blocker: { reason: "CONNECTION_UNAVAILABLE" },
          id: "POSTGRESQL_TRIGRAM_MATCHING",
          status: "UNKNOWN",
        },
        {
          blocker: { reason: "CONNECTION_UNAVAILABLE" },
          id: "POSTGRESQL_VECTOR_STORAGE",
          status: "UNKNOWN",
        },
      ],
    });

    expect(pgliteGateExitCode(report)).toBe(1);
  });

  it("does not accept a malformed assessment as PGlite compatibility", () => {
    expect(() =>
      evaluatePgliteGate({
        requirements: [
          { id: "POSTGRESQL_CORE", status: "SATISFIED" },
          { id: "POSTGRESQL_CORE", status: "SATISFIED" },
          { id: "POSTGRESQL_VECTOR_STORAGE", status: "SATISFIED" },
        ],
      }),
    ).toThrow();
  });
});
