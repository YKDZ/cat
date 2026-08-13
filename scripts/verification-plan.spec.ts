import { describe, expect, it } from "vitest";

import {
  aggregateVerificationRecords,
  createVerificationPlan,
  digestVerificationPlan,
  parseVerificationRecord,
  serializeVerificationPlan,
  serializeVerificationRecord,
  validateVerificationPlan,
  type VerificationPlan,
  type VerificationRecord,
  type VerificationRunIdentity,
} from "./verification-plan.ts";

const requiredNodeIds = new Set([
  "quality",
  "source-compose-contract",
  "source-base-image",
  "source-pglite",
  "source-dockerfile",
  "source-application-build",
  "source-package-artifacts",
  "source-image-artifact-contract",
  "spacy-image",
  "application-images",
  "integration",
  "e2e-dev",
  "e2e-standalone",
  "e2e-runtime",
  "container-lifecycle",
]);

const recordsFor = (
  plan: VerificationPlan,
  workflow?: VerificationRunIdentity,
): VerificationRecord[] =>
  plan.nodes
    .filter((node) => node.requiredRecord)
    .map((node) =>
      parseVerificationRecord({
        artifacts: Object.fromEntries(
          node.requiredArtifacts.map((artifact) => [artifact, "candidate-a"]),
        ),
        cleanupCompleted: true,
        durationMs: 1,
        immutableInputs: { "source-sha": workflow?.sha ?? "local-sha" },
        lane: node.lane,
        nodeId: node.id,
        planDigest: plan.digest,
        schemaVersion: 1,
        ...(workflow === undefined ? {} : { workflow }),
      }),
    );

const replaceRecord = (
  records: readonly VerificationRecord[],
  nodeId: string,
  update: (record: VerificationRecord) => VerificationRecord,
): VerificationRecord[] =>
  records.map((record) => (record.nodeId === nodeId ? update(record) : record));

describe("Complete Verification plan", () => {
  it("describes the repository nodes, target groups, and critical dependencies", () => {
    const plan = createVerificationPlan();
    const nodes = new Map(plan.nodes.map((node) => [node.id, node]));

    expect(new Set(nodes.keys())).toEqual(
      new Set([...requiredNodeIds, "aggregate", "release"]),
    );
    expect(
      new Map(
        plan.nodes.flatMap((node) =>
          node.e2eTarget === undefined
            ? []
            : [[node.e2eTarget, node.lane] as const],
        ),
      ),
    ).toEqual(
      new Map([
        ["dev", "e2e-dev"],
        ["standalone", "e2e-standalone"],
        ["runtime", "e2e-runtime"],
      ]),
    );
    expect(nodes.get("integration")?.dependencies).toEqual(["spacy-image"]);
    expect(nodes.get("source-base-image")?.resourceLane).toBe("cpu");
    expect(nodes.get("source-package-artifacts")?.dependencies).toEqual([
      "source-application-build",
    ]);
    expect(nodes.get("source-image-artifact-contract")?.resourceLane).toBe(
      "docker",
    );
    expect(nodes.get("e2e-dev")?.dependencies).toEqual(["spacy-image"]);
    expect(new Set(nodes.get("e2e-standalone")?.dependencies)).toEqual(
      new Set(["spacy-image", "application-images"]),
    );
    expect(new Set(nodes.get("e2e-runtime")?.dependencies)).toEqual(
      new Set(["spacy-image", "application-images"]),
    );
    expect(new Set(nodes.get("container-lifecycle")?.dependencies)).toEqual(
      new Set(["spacy-image", "application-images"]),
    );
    expect(new Set(nodes.get("aggregate")?.dependencies)).toEqual(
      requiredNodeIds,
    );
    expect(nodes.get("release")?.dependencies).toEqual(["aggregate"]);
  });

  it.each([
    [
      "an incomplete E2E catalogue selection",
      () =>
        createVerificationPlan({
          e2eCells: [{ browser: "chromium", target: "dev" }],
        }),
      "complete execution-cell catalogue",
    ],
    [
      "an unsupported E2E catalogue cell",
      () =>
        createVerificationPlan({
          e2eCells: [{ browser: "firefox", target: "dev" }],
        }),
      "complete execution-cell catalogue",
    ],
    [
      "a missing image target",
      () => createVerificationPlan({ imageTargets: ["spacy", "standalone"] }),
      "image target catalogue",
    ],
    [
      "an extra image target",
      () =>
        createVerificationPlan({
          imageTargets: ["spacy", "standalone", "runtime", "unexpected"],
        }),
      "image target catalogue",
    ],
  ])("rejects %s", (_name, action, message) => {
    expect(action).toThrow(message);
  });

  it("rejects structural errors before enforcing the fixed CAT graph", () => {
    const plan = createVerificationPlan();
    const duplicate = plan.nodes.map((node) => ({ ...node }));
    duplicate[1] = { ...duplicate[1]!, id: "quality" };
    expect(() => validateVerificationPlan(duplicate)).toThrow("duplicate");

    const unknownDependency = plan.nodes.map((node) => ({
      ...node,
      dependencies: [...node.dependencies],
    }));
    unknownDependency[0] = {
      ...unknownDependency[0]!,
      dependencies: ["missing"],
    };
    expect(() => validateVerificationPlan(unknownDependency)).toThrow(
      "unknown dependency",
    );

    const cycle = plan.nodes.map((node) => ({
      ...node,
      dependencies: [...node.dependencies],
    }));
    cycle[0] = { ...cycle[0]!, dependencies: ["aggregate"] };
    expect(() => validateVerificationPlan(cycle)).toThrow("cycle");

    const invalidLane = plan.nodes.map((node) => ({ ...node }));
    invalidLane[0] = {
      ...invalidLane[0]!,
      resourceLane: "network" as "cpu",
    };
    expect(() => validateVerificationPlan(invalidLane)).toThrow(
      "invalid resource",
    );

    const unreachable = plan.nodes.map((node) => ({
      ...node,
      dependencies: [...node.dependencies],
    }));
    const aggregate = unreachable.find((node) => node.id === "aggregate")!;
    aggregate.dependencies = aggregate.dependencies.filter(
      (dependency) => dependency !== "quality",
    );
    expect(() => validateVerificationPlan(unreachable)).toThrow(
      "unreachable required node quality",
    );
  });

  it("rejects a structurally valid change to the fixed CAT graph", () => {
    const nodes = createVerificationPlan().nodes.map((node) =>
      node.id === "integration" ? { ...node, dependencies: [] } : node,
    );

    expect(() => validateVerificationPlan(nodes)).toThrow(
      "does not match the repository verification graph",
    );
  });

  it("canonicalizes unordered plan collections for serialization and digesting", () => {
    const plan = createVerificationPlan();
    const reorderedNodes = [...plan.nodes].reverse().map((node) => ({
      ...node,
      dependencies: [...node.dependencies].reverse(),
      immutableInputs: [...node.immutableInputs].reverse(),
      requiredArtifacts: [...node.requiredArtifacts].reverse(),
    }));

    expect(digestVerificationPlan(reorderedNodes)).toBe(plan.digest);
    expect(serializeVerificationPlan({ ...plan, nodes: reorderedNodes })).toBe(
      serializeVerificationPlan(plan),
    );
    expect(serializeVerificationPlan(createVerificationPlan())).toBe(
      serializeVerificationPlan(createVerificationPlan()),
    );
  });

  it("strictly parses and deterministically serializes records", () => {
    const record = recordsFor(createVerificationPlan()).find(
      (candidate) => candidate.nodeId === "e2e-standalone",
    )!;

    expect(() =>
      parseVerificationRecord({ ...record, runAttempt: "2" }),
    ).toThrow("unallowlisted");
    expect(serializeVerificationRecord(record)).toBe(
      serializeVerificationRecord({
        ...record,
        artifacts: Object.fromEntries(
          Object.entries(record.artifacts).reverse(),
        ),
        immutableInputs: Object.fromEntries(
          Object.entries(record.immutableInputs).reverse(),
        ),
      }),
    );
  });
});

describe("Verification record aggregation", () => {
  const workflow = { runId: "run-1", sha: "commit-1" } as const;

  it("accepts complete local and CI record sets", () => {
    const plan = createVerificationPlan();
    const localRecords = recordsFor(plan);
    const ciRecords = recordsFor(plan, workflow);

    expect(
      aggregateVerificationRecords(plan, localRecords, {
        sourceSha: "local-sha",
      }),
    ).toEqual({ planDigest: plan.digest, recordCount: localRecords.length });
    expect(
      aggregateVerificationRecords(plan, ciRecords, {
        runIdentity: workflow,
      }),
    ).toEqual({ planDigest: plan.digest, recordCount: ciRecords.length });
  });

  it.each([
    [
      "missing records",
      (records: VerificationRecord[]) =>
        records.filter((record) => record.nodeId !== "quality"),
      "missing record for quality",
    ],
    [
      "unknown records",
      (records: VerificationRecord[]) => [
        { ...records[0]!, nodeId: "unknown" },
        ...records.slice(1),
      ],
      "unknown record node",
    ],
    [
      "duplicate records",
      (records: VerificationRecord[]) => [...records, records[0]!],
      "duplicate record",
    ],
    [
      "cross-plan records",
      (records: VerificationRecord[]) => [
        { ...records[0]!, planDigest: "f".repeat(64) },
        ...records.slice(1),
      ],
      "stale plan digest",
    ],
    [
      "cross-run records",
      (records: VerificationRecord[]) => [
        {
          ...records[0]!,
          workflow: { runId: "run-2", sha: workflow.sha },
        },
        ...records.slice(1),
      ],
      "mixed workflow identity",
    ],
    [
      "cross-commit workflow records",
      (records: VerificationRecord[]) => [
        {
          ...records[0]!,
          workflow: { runId: workflow.runId, sha: "commit-2" },
        },
        ...records.slice(1),
      ],
      "mixed workflow identity",
    ],
    [
      "workflow/source commit mismatches",
      (records: VerificationRecord[]) =>
        records.map((record) => ({
          ...record,
          immutableInputs: { "source-sha": "commit-2" },
        })),
      "source SHA",
    ],
    [
      "mismatched lanes",
      (records: VerificationRecord[]) => [
        { ...records[0]!, lane: "wrong-lane" },
        ...records.slice(1),
      ],
      "mismatched lane",
    ],
    [
      "mismatched artifacts",
      (records: VerificationRecord[]) =>
        replaceRecord(records, "e2e-standalone", (record) => ({
          ...record,
          artifacts: {
            ...record.artifacts,
            "application-candidates": "candidate-b",
          },
        })),
      "mismatched artifact",
    ],
    [
      "mismatched immutable inputs",
      (records: VerificationRecord[]) =>
        replaceRecord(records, "quality", (record) => ({
          ...record,
          immutableInputs: { "source-sha": "commit-2" },
        })),
      "source SHA",
    ],
    [
      "open dependencies",
      (records: VerificationRecord[]) =>
        records.filter((record) => record.nodeId !== "spacy-image"),
      "open dependency spacy-image",
    ],
    [
      "incomplete cleanup",
      (records: VerificationRecord[]) => [
        { ...records[0]!, cleanupCompleted: false },
        ...records.slice(1),
      ],
      "incomplete cleanup",
    ],
  ])("rejects %s", (_name, mutate, message) => {
    const plan = createVerificationPlan();
    const records = recordsFor(plan, workflow);

    expect(() =>
      aggregateVerificationRecords(plan, mutate(records), {
        runIdentity: workflow,
      }),
    ).toThrow(message);
  });

  it("binds local records to an explicit source identity without GitHub fields", () => {
    const plan = createVerificationPlan();

    expect(() =>
      aggregateVerificationRecords(plan, recordsFor(plan), {
        sourceSha: "different-local-sha",
      }),
    ).toThrow("source SHA");
  });
});
