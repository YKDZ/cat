import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod/v4";

import type {
  WorkflowRun,
  DecisionBlock,
  IssueSyncMapping,
  CoordinatorState,
} from "../shared/types.js";

import {
  WorkflowRunSchema,
  DecisionBlockSchema,
  CoordinatorStateSchema,
  IssueSyncMappingSchema,
} from "../shared/schemas.js";
import { acquireLock } from "../shared/file-lock.js";

const getStateDir = (workspaceRoot: string): string =>
  resolve(workspaceRoot, "tools/auto-dev/state");

const getRunsDir = (workspaceRoot: string): string =>
  resolve(getStateDir(workspaceRoot), "runs");

const getDecisionsDir = (workspaceRoot: string): string =>
  resolve(getStateDir(workspaceRoot), "decisions");

const getSyncDir = (workspaceRoot: string): string =>
  resolve(getStateDir(workspaceRoot), "sync");

const getCoordinatorPath = (workspaceRoot: string): string =>
  resolve(getStateDir(workspaceRoot), "coordinator.json");

// ── Directory initialization ─────────────────────────────────────────

export const ensureStateDirs = async (workspaceRoot: string): Promise<void> => {
  const dirs = [
    getRunsDir(workspaceRoot),
    getDecisionsDir(workspaceRoot),
    getSyncDir(workspaceRoot),
  ];
  await Promise.all(dirs.map((d) => mkdir(d, { recursive: true })));
};

// ── WorkflowRun CRUD ──────────────────────────────────────────────────

const getRunPath = (workspaceRoot: string, runId: string): string =>
  resolve(getRunsDir(workspaceRoot), `${runId}.json`);

export const saveWorkflowRun = async (
  workspaceRoot: string,
  run: WorkflowRun,
): Promise<void> => {
  const filePath = getRunPath(workspaceRoot, run.id);
  const release = await acquireLock(filePath);
  try {
    await writeFile(filePath, JSON.stringify(run, null, 2), "utf-8");
  } finally {
    await release();
  }
};

export const loadWorkflowRun = (
  workspaceRoot: string,
  runId: string,
): WorkflowRun | null => {
  const filePath = getRunPath(workspaceRoot, runId);
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, "utf-8");
  return WorkflowRunSchema.parse(JSON.parse(raw)) as WorkflowRun;
};

export const listWorkflowRuns = (workspaceRoot: string): WorkflowRun[] => {
  const dir = getRunsDir(workspaceRoot);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f: string) => f.endsWith(".json"));
  return files.map((f: string) => {
    const raw = readFileSync(resolve(dir, f), "utf-8");
    return WorkflowRunSchema.parse(JSON.parse(raw)) as WorkflowRun;
  });
};

// ── DecisionBlock CRUD ────────────────────────────────────────────────

const getDecisionPath = (workspaceRoot: string, decisionId: string): string =>
  resolve(getDecisionsDir(workspaceRoot), `${decisionId}.json`);

export const saveDecision = async (
  workspaceRoot: string,
  decision: DecisionBlock,
): Promise<void> => {
  const filePath = getDecisionPath(workspaceRoot, decision.id);
  const release = await acquireLock(filePath);
  try {
    await writeFile(filePath, JSON.stringify(decision, null, 2), "utf-8");
  } finally {
    await release();
  }
};

export const loadDecision = (
  workspaceRoot: string,
  decisionId: string,
): DecisionBlock | null => {
  const filePath = getDecisionPath(workspaceRoot, decisionId);
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, "utf-8");
  return DecisionBlockSchema.parse(JSON.parse(raw)) as DecisionBlock;
};

export const listDecisions = (workspaceRoot: string): DecisionBlock[] => {
  const dir = getDecisionsDir(workspaceRoot);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f: string) => f.endsWith(".json"));
  return files.map((f: string) => {
    const raw = readFileSync(resolve(dir, f), "utf-8");
    return DecisionBlockSchema.parse(JSON.parse(raw)) as DecisionBlock;
  });
};

// ── CoordinatorState ──────────────────────────────────────────────────

export const saveCoordinatorState = async (
  workspaceRoot: string,
  state: CoordinatorState,
): Promise<void> => {
  const filePath = getCoordinatorPath(workspaceRoot);
  const release = await acquireLock(filePath);
  try {
    await writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
  } finally {
    await release();
  }
};

export const loadCoordinatorState = (
  workspaceRoot: string,
): CoordinatorState | null => {
  const filePath = getCoordinatorPath(workspaceRoot);
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, "utf-8");
  return CoordinatorStateSchema.parse(JSON.parse(raw));
};

// ── IssueSyncMapping ──────────────────────────────────────────────────

const getMappingsPath = (workspaceRoot: string): string =>
  resolve(getSyncDir(workspaceRoot), "mappings.json");

export const saveSyncMappings = async (
  workspaceRoot: string,
  mappings: IssueSyncMapping[],
): Promise<void> => {
  const filePath = getMappingsPath(workspaceRoot);
  const release = await acquireLock(filePath);
  try {
    await writeFile(filePath, JSON.stringify(mappings, null, 2), "utf-8");
  } finally {
    await release();
  }
};

export const loadSyncMappings = (workspaceRoot: string): IssueSyncMapping[] => {
  const filePath = getMappingsPath(workspaceRoot);
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf-8");
  return z.array(IssueSyncMappingSchema).parse(JSON.parse(raw));
};
