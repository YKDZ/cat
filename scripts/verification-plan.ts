import { createHash } from "node:crypto";

import { selectE2EExecutionCells } from "../apps/app-e2e/execution-cell-catalogue.ts";
import { releaseImageTargets } from "./image-builder.ts";

export const verificationPlanSchemaVersion = 1 as const;
export const verificationRecordSchemaVersion = 1 as const;

export type VerificationResourceLane = "cpu" | "docker";
export type VerificationTimeoutClass = "short" | "standard" | "long";
export type VerificationE2ETarget = "dev" | "standalone" | "runtime";

export type VerificationNode = {
  dependencies: string[];
  e2eTarget?: VerificationE2ETarget;
  id: string;
  immutableInputs: string[];
  lane: string;
  requiredArtifacts: string[];
  requiredRecord: boolean;
  resourceLane: VerificationResourceLane;
  timeoutClass: VerificationTimeoutClass;
};

export type VerificationPlan = {
  digest: string;
  nodes: VerificationNode[];
  schemaVersion: typeof verificationPlanSchemaVersion;
};

export type VerificationRunIdentity = {
  runId: string;
  sha: string;
};

export type VerificationRecord = {
  artifacts: Record<string, string>;
  cleanupCompleted: boolean;
  durationMs: number;
  immutableInputs: Record<string, string>;
  lane: string;
  nodeId: string;
  planDigest: string;
  schemaVersion: typeof verificationRecordSchemaVersion;
  workflow?: VerificationRunIdentity;
};

export type VerificationAggregationOptions = {
  artifactIdentities?: Readonly<Record<string, string>>;
  runIdentity?: VerificationRunIdentity;
  sourceSha?: string;
};

export type VerificationPlanOptions = {
  e2eCells?: readonly {
    browser: "chromium" | "firefox";
    target: VerificationE2ETarget;
  }[];
  imageTargets?: readonly string[];
};

const validResourceLanes = new Set<VerificationResourceLane>(["cpu", "docker"]);
const validTimeoutClasses = new Set<VerificationTimeoutClass>([
  "short",
  "standard",
  "long",
]);
const validE2ETargets = new Set<VerificationE2ETarget>([
  "dev",
  "standalone",
  "runtime",
]);
const identifier = /^[a-z][a-z0-9-]*$/;

const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${stableJson(Reflect.get(value, key))}`,
    )
    .join(",")}}`;
};

const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const canonicalPlanNodes = (
  nodes: readonly VerificationNode[],
): VerificationNode[] =>
  nodes
    .map((node) => ({
      ...node,
      dependencies: [...node.dependencies].sort(compareStrings),
      immutableInputs: [...node.immutableInputs].sort(compareStrings),
      requiredArtifacts: [...node.requiredArtifacts].sort(compareStrings),
    }))
    .sort((left, right) => compareStrings(left.id, right.id));

const planDefinition = (
  e2eTargets: readonly VerificationE2ETarget[],
): VerificationNode[] => {
  const nodes: VerificationNode[] = [
    {
      dependencies: [],
      id: "quality",
      immutableInputs: ["source-sha"],
      lane: "quality",
      requiredArtifacts: [],
      requiredRecord: true,
      resourceLane: "cpu",
      timeoutClass: "standard",
    },
    {
      dependencies: [],
      id: "source-base-image",
      immutableInputs: ["source-sha"],
      lane: "source-base-image",
      requiredArtifacts: [],
      requiredRecord: true,
      resourceLane: "cpu",
      timeoutClass: "short",
    },
    {
      dependencies: [],
      id: "source-compose-contract",
      immutableInputs: ["source-sha"],
      lane: "source-compose-contract",
      requiredArtifacts: [],
      requiredRecord: true,
      resourceLane: "cpu",
      timeoutClass: "short",
    },
    {
      dependencies: [],
      id: "source-pglite",
      immutableInputs: ["source-sha"],
      lane: "source-pglite",
      requiredArtifacts: [],
      requiredRecord: true,
      resourceLane: "cpu",
      timeoutClass: "standard",
    },
    {
      dependencies: [],
      id: "source-dockerfile",
      immutableInputs: ["source-sha"],
      lane: "source-dockerfile",
      requiredArtifacts: [],
      requiredRecord: true,
      resourceLane: "docker",
      timeoutClass: "short",
    },
    {
      dependencies: [],
      id: "source-application-build",
      immutableInputs: ["source-sha"],
      lane: "source-application-build",
      requiredArtifacts: [],
      requiredRecord: true,
      resourceLane: "cpu",
      timeoutClass: "long",
    },
    {
      dependencies: ["source-application-build"],
      id: "source-package-artifacts",
      immutableInputs: ["source-sha"],
      lane: "source-package-artifacts",
      requiredArtifacts: [],
      requiredRecord: true,
      resourceLane: "cpu",
      timeoutClass: "long",
    },
    {
      dependencies: [],
      id: "source-image-artifact-contract",
      immutableInputs: ["source-sha"],
      lane: "source-image-artifact-contract",
      requiredArtifacts: [],
      requiredRecord: true,
      resourceLane: "docker",
      timeoutClass: "standard",
    },
    {
      dependencies: [],
      id: "spacy-image",
      immutableInputs: ["source-sha"],
      lane: "spacy-image",
      requiredArtifacts: ["spacy-candidate"],
      requiredRecord: true,
      resourceLane: "docker",
      timeoutClass: "long",
    },
    {
      dependencies: [],
      id: "application-images",
      immutableInputs: ["source-sha"],
      lane: "application-images",
      requiredArtifacts: ["application-candidates"],
      requiredRecord: true,
      resourceLane: "docker",
      timeoutClass: "long",
    },
    {
      dependencies: ["spacy-image"],
      id: "integration",
      immutableInputs: ["source-sha"],
      lane: "integration",
      requiredArtifacts: ["spacy-candidate"],
      requiredRecord: true,
      resourceLane: "docker",
      timeoutClass: "long",
    },
    ...e2eTargets.map(
      (target): VerificationNode => ({
        dependencies:
          target === "dev"
            ? ["spacy-image"]
            : ["spacy-image", "application-images"],
        e2eTarget: target,
        id: `e2e-${target}`,
        immutableInputs: ["source-sha"],
        lane: `e2e-${target}`,
        requiredArtifacts:
          target === "dev"
            ? ["spacy-candidate"]
            : ["application-candidates", "spacy-candidate"],
        requiredRecord: true,
        resourceLane: "docker",
        timeoutClass: "long",
      }),
    ),
    {
      dependencies: ["spacy-image", "application-images"],
      id: "container-lifecycle",
      immutableInputs: ["source-sha"],
      lane: "container-lifecycle",
      requiredArtifacts: ["application-candidates", "spacy-candidate"],
      requiredRecord: true,
      resourceLane: "docker",
      timeoutClass: "long",
    },
    {
      dependencies: [],
      id: "aggregate",
      immutableInputs: ["source-sha"],
      lane: "aggregate",
      requiredArtifacts: [],
      requiredRecord: false,
      resourceLane: "cpu",
      timeoutClass: "short",
    },
    {
      dependencies: ["aggregate"],
      id: "release",
      immutableInputs: ["source-sha"],
      lane: "release",
      requiredArtifacts: ["application-candidates", "spacy-candidate"],
      requiredRecord: false,
      resourceLane: "docker",
      timeoutClass: "standard",
    },
  ];
  const aggregate = nodes.find((node) => node.id === "aggregate");
  if (aggregate === undefined)
    throw new Error("Verification plan has no aggregate node");
  aggregate.dependencies = nodes
    .filter((node) => node.requiredRecord)
    .map((node) => node.id);
  return nodes;
};

const reaches = (
  from: string,
  target: string,
  nodesById: ReadonlyMap<string, VerificationNode>,
  seen = new Set<string>(),
): boolean => {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  const node = nodesById.get(from);
  return (
    node?.dependencies.some((dependency) =>
      reaches(dependency, target, nodesById, seen),
    ) ?? false
  );
};

const assertNoCycle = (
  node: VerificationNode,
  nodesById: ReadonlyMap<string, VerificationNode>,
  visiting: Set<string>,
  visited: Set<string>,
): void => {
  if (visited.has(node.id)) return;
  if (visiting.has(node.id)) {
    throw new Error(`Verification plan has a dependency cycle at ${node.id}`);
  }
  visiting.add(node.id);
  for (const dependency of node.dependencies) {
    const dependencyNode = nodesById.get(dependency);
    if (dependencyNode !== undefined) {
      assertNoCycle(dependencyNode, nodesById, visiting, visited);
    }
  }
  visiting.delete(node.id);
  visited.add(node.id);
};

export const validateVerificationPlan = (
  nodes: readonly VerificationNode[],
  imageTargets: readonly string[] = releaseImageTargets,
): void => {
  const nodesById = new Map<string, VerificationNode>();
  const lanes = new Set<string>();
  for (const node of nodes) {
    if (!identifier.test(node.id) || nodesById.has(node.id)) {
      throw new Error(
        `Verification plan has a duplicate or invalid node ${node.id}`,
      );
    }
    if (!identifier.test(node.lane) || lanes.has(node.lane)) {
      throw new Error(
        `Verification plan has a duplicate or invalid lane ${node.lane}`,
      );
    }
    if (
      !validResourceLanes.has(node.resourceLane) ||
      !validTimeoutClasses.has(node.timeoutClass)
    ) {
      throw new Error(
        `Verification plan has invalid resource or timeout lane for ${node.id}`,
      );
    }
    if (
      node.e2eTarget !== undefined &&
      (!validE2ETargets.has(node.e2eTarget) ||
        node.id !== `e2e-${node.e2eTarget}`)
    ) {
      throw new Error(
        `Verification plan has an invalid E2E target for ${node.id}`,
      );
    }
    if (
      new Set(node.dependencies).size !== node.dependencies.length ||
      new Set(node.immutableInputs).size !== node.immutableInputs.length ||
      new Set(node.requiredArtifacts).size !== node.requiredArtifacts.length
    ) {
      throw new Error(
        `Verification plan has duplicate node fields for ${node.id}`,
      );
    }
    nodesById.set(node.id, node);
    lanes.add(node.lane);
  }
  for (const node of nodes) {
    for (const dependency of node.dependencies) {
      if (!nodesById.has(dependency)) {
        throw new Error(
          `Verification plan has an unknown dependency ${dependency}`,
        );
      }
    }
    assertNoCycle(node, nodesById, new Set(), new Set());
  }
  const aggregate = nodesById.get("aggregate");
  if (aggregate === undefined || nodesById.get("release") === undefined) {
    throw new Error("Verification plan requires aggregate and release nodes");
  }
  for (const node of nodes) {
    if (node.requiredRecord && !reaches("aggregate", node.id, nodesById)) {
      throw new Error(
        `Verification plan has an unreachable required node ${node.id}`,
      );
    }
  }
  if (!reaches("release", "aggregate", nodesById)) {
    throw new Error("Verification plan release does not depend on aggregate");
  }
  const expectedNodes = planDefinition(["dev", "standalone", "runtime"]);
  if (
    stableJson(canonicalPlanNodes(nodes)) !==
    stableJson(canonicalPlanNodes(expectedNodes))
  ) {
    throw new Error(
      "Verification plan does not match the repository verification graph",
    );
  }
  const expectedImageTargets = [...releaseImageTargets].sort(compareStrings);
  const actualImageTargets = [...imageTargets].sort(compareStrings);
  if (
    actualImageTargets.length !== expectedImageTargets.length ||
    actualImageTargets.some(
      (target, index) => target !== expectedImageTargets[index],
    )
  ) {
    throw new Error(
      "Verification plan image target catalogue does not exactly match release capabilities",
    );
  }
};

export const digestVerificationPlan = (
  nodes: readonly VerificationNode[],
): string =>
  createHash("sha256")
    .update(
      stableJson({
        nodes: canonicalPlanNodes(nodes),
        schemaVersion: verificationPlanSchemaVersion,
      }),
    )
    .digest("hex");

const assertCompleteE2ECatalogue = (
  cells: readonly {
    browser: "chromium" | "firefox";
    target: VerificationE2ETarget;
  }[],
): void => {
  const cellIdentity = (cell: {
    browser: "chromium" | "firefox";
    target: VerificationE2ETarget;
  }): string => `${cell.target}/${cell.browser}`;
  const expected = selectE2EExecutionCells({ target: "all" })
    .map(cellIdentity)
    .sort(compareStrings);
  const actual = cells.map(cellIdentity).sort(compareStrings);
  if (
    actual.length !== expected.length ||
    actual.some((identity, index) => identity !== expected[index])
  ) {
    throw new Error(
      "Verification plan requires the complete execution-cell catalogue",
    );
  }
};

export const createVerificationPlan = (
  options: VerificationPlanOptions = {},
): VerificationPlan => {
  const e2eCells =
    options.e2eCells ?? selectE2EExecutionCells({ target: "all" });
  assertCompleteE2ECatalogue(e2eCells);
  const e2eTargets = [...new Set(e2eCells.map((cell) => cell.target))];
  const nodes = planDefinition(e2eTargets).map((node) => ({
    ...node,
    dependencies: [...node.dependencies],
    immutableInputs: [...node.immutableInputs],
    requiredArtifacts: [...node.requiredArtifacts],
  }));
  validateVerificationPlan(nodes, options.imageTargets);
  return {
    digest: digestVerificationPlan(nodes),
    nodes,
    schemaVersion: verificationPlanSchemaVersion,
  };
};

export const serializeVerificationPlan = (plan: VerificationPlan): string => {
  validateVerificationPlan(plan.nodes);
  const digest = digestVerificationPlan(plan.nodes);
  if (
    plan.schemaVersion !== verificationPlanSchemaVersion ||
    plan.digest !== digest
  ) {
    throw new Error("Verification plan has an invalid schema or digest");
  }
  return (
    stableJson({
      digest: plan.digest,
      nodes: canonicalPlanNodes(plan.nodes),
      schemaVersion: plan.schemaVersion,
    }) + "\n"
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
  message: string,
): void => {
  const keys = Object.keys(value);
  if (
    keys.length !== expected.length ||
    keys.some((key) => !expected.includes(key))
  ) {
    throw new Error(message);
  }
};

const parseStringMap = (
  value: unknown,
  field: string,
): Record<string, string> => {
  if (!isRecord(value)) {
    throw new Error(`Verification record has an invalid ${field}`);
  }
  const parsed: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!identifier.test(key) || typeof item !== "string" || item === "") {
      throw new Error(`Verification record has an invalid ${field}`);
    }
    parsed[key] = item;
  }
  return parsed;
};

const parseRunIdentity = (value: unknown): VerificationRunIdentity => {
  if (!isRecord(value)) {
    throw new Error("Verification record has an invalid workflow identity");
  }
  assertExactKeys(
    value,
    ["runId", "sha"],
    "Verification record has an invalid workflow identity",
  );
  if (
    typeof value.runId !== "string" ||
    value.runId === "" ||
    typeof value.sha !== "string" ||
    value.sha === ""
  ) {
    throw new Error("Verification record has an invalid workflow identity");
  }
  return { runId: value.runId, sha: value.sha };
};

export const parseVerificationRecord = (value: unknown): VerificationRecord => {
  if (!isRecord(value))
    throw new Error("Verification record must be an object");
  const hasWorkflow = Object.hasOwn(value, "workflow");
  assertExactKeys(
    value,
    hasWorkflow
      ? [
          "artifacts",
          "cleanupCompleted",
          "durationMs",
          "immutableInputs",
          "lane",
          "nodeId",
          "planDigest",
          "schemaVersion",
          "workflow",
        ]
      : [
          "artifacts",
          "cleanupCompleted",
          "durationMs",
          "immutableInputs",
          "lane",
          "nodeId",
          "planDigest",
          "schemaVersion",
        ],
    "Verification record has unallowlisted fields",
  );
  if (
    value.schemaVersion !== verificationRecordSchemaVersion ||
    !Number.isFinite(value.durationMs) ||
    typeof value.durationMs !== "number" ||
    value.durationMs < 0 ||
    typeof value.nodeId !== "string" ||
    !identifier.test(value.nodeId) ||
    typeof value.lane !== "string" ||
    !identifier.test(value.lane) ||
    typeof value.planDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.planDigest) ||
    typeof value.cleanupCompleted !== "boolean"
  ) {
    throw new Error("Verification record has invalid fields");
  }
  return {
    artifacts: parseStringMap(value.artifacts, "artifacts"),
    cleanupCompleted: value.cleanupCompleted,
    durationMs: value.durationMs,
    immutableInputs: parseStringMap(value.immutableInputs, "immutable inputs"),
    lane: value.lane,
    nodeId: value.nodeId,
    planDigest: value.planDigest,
    schemaVersion: verificationRecordSchemaVersion,
    ...(hasWorkflow ? { workflow: parseRunIdentity(value.workflow) } : {}),
  };
};

export const serializeVerificationRecord = (
  record: VerificationRecord,
): string => stableJson(parseVerificationRecord(record)) + "\n";

const sameStringMap = (
  actual: Record<string, string>,
  expected: readonly string[],
): boolean =>
  Object.keys(actual).length === expected.length &&
  expected.every((key) => actual[key] !== undefined);

const sameIdentity = (
  actual: VerificationRunIdentity | undefined,
  expected: VerificationRunIdentity | undefined,
): boolean =>
  actual?.runId === expected?.runId && actual?.sha === expected?.sha;

export const aggregateVerificationRecords = (
  plan: VerificationPlan,
  records: readonly VerificationRecord[],
  options: VerificationAggregationOptions = {},
): { planDigest: string; recordCount: number } => {
  serializeVerificationPlan(plan);
  const nodesById = new Map(plan.nodes.map((node) => [node.id, node]));
  const requiredNodes = plan.nodes.filter((node) => node.requiredRecord);
  const recordsByNodeId = new Map<string, VerificationRecord>();
  const artifactIdentities = new Map<string, string>();
  const immutableInputIdentities = new Map<string, string>();
  const expectedIdentity = options.runIdentity;
  const expectedSourceSha = expectedIdentity?.sha ?? options.sourceSha;
  const requiredArtifactNames = new Set(
    requiredNodes.flatMap((node) => node.requiredArtifacts),
  );
  for (const [artifact, identity] of Object.entries(
    options.artifactIdentities ?? {},
  )) {
    if (!requiredArtifactNames.has(artifact) || identity === "") {
      throw new Error(
        `Verification aggregate has invalid expected artifact ${artifact}`,
      );
    }
  }
  for (const input of records) {
    const record = parseVerificationRecord(input);
    const node = nodesById.get(record.nodeId);
    if (node === undefined || !node.requiredRecord) {
      throw new Error(
        `Verification aggregate has an unknown record node ${record.nodeId}`,
      );
    }
    if (recordsByNodeId.has(record.nodeId)) {
      throw new Error(
        `Verification aggregate has a duplicate record for ${record.nodeId}`,
      );
    }
    if (record.planDigest !== plan.digest) {
      throw new Error(
        `Verification aggregate has a stale plan digest for ${record.nodeId}`,
      );
    }
    if (record.lane !== node.lane) {
      throw new Error(
        `Verification aggregate has a mismatched lane for ${record.nodeId}`,
      );
    }
    if (!sameIdentity(record.workflow, expectedIdentity)) {
      throw new Error(
        `Verification aggregate has mixed workflow identity for ${record.nodeId}`,
      );
    }
    if (!sameStringMap(record.immutableInputs, node.immutableInputs)) {
      throw new Error(
        `Verification aggregate has invalid immutable inputs for ${record.nodeId}`,
      );
    }
    if (
      expectedSourceSha !== undefined &&
      record.immutableInputs["source-sha"] !== expectedSourceSha
    ) {
      throw new Error(
        `Verification aggregate has a mismatched source SHA for ${record.nodeId}`,
      );
    }
    if (!sameStringMap(record.artifacts, node.requiredArtifacts)) {
      throw new Error(
        `Verification aggregate has invalid artifacts for ${record.nodeId}`,
      );
    }
    if (!record.cleanupCompleted) {
      throw new Error(
        `Verification aggregate has incomplete cleanup for ${record.nodeId}`,
      );
    }
    for (const [inputName, identity] of Object.entries(
      record.immutableInputs,
    )) {
      const priorIdentity = immutableInputIdentities.get(inputName);
      if (priorIdentity !== undefined && priorIdentity !== identity) {
        throw new Error(
          `Verification aggregate has a mismatched immutable input ${inputName}`,
        );
      }
      immutableInputIdentities.set(inputName, identity);
    }
    for (const [artifact, identity] of Object.entries(record.artifacts)) {
      const expectedArtifactIdentity = options.artifactIdentities?.[artifact];
      if (
        expectedArtifactIdentity !== undefined &&
        identity !== expectedArtifactIdentity
      ) {
        throw new Error(
          `Verification aggregate has a mismatched artifact ${artifact}`,
        );
      }
      const priorIdentity = artifactIdentities.get(artifact);
      if (priorIdentity !== undefined && priorIdentity !== identity) {
        throw new Error(
          `Verification aggregate has a mismatched artifact ${artifact}`,
        );
      }
      artifactIdentities.set(artifact, identity);
    }
    recordsByNodeId.set(record.nodeId, record);
  }
  for (const nodeId of recordsByNodeId.keys()) {
    const node = nodesById.get(nodeId)!;
    for (const dependency of node.dependencies) {
      const dependencyNode = nodesById.get(dependency);
      if (dependencyNode?.requiredRecord && !recordsByNodeId.has(dependency)) {
        throw new Error(
          `Verification aggregate has open dependency ${dependency}`,
        );
      }
    }
  }
  for (const node of requiredNodes) {
    if (!recordsByNodeId.has(node.id)) {
      throw new Error(
        `Verification aggregate is missing record for ${node.id}`,
      );
    }
  }
  return { planDigest: plan.digest, recordCount: records.length };
};
