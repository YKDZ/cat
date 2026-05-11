import {
  createProject,
  createUser,
  ensureLanguages,
  executeCommand,
  executeQuery,
  getDbHandle,
  listAllElements,
  listProjectContentNodes,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createDefaultGraphRuntime } from "@/graph";
import { runGraph } from "@/graph/dsl";

import { ingestCollectionGraph } from "../ingest-collection";

let cleanup: () => Promise<void>;
let projectId: string;
let vectorizerId: number;
let vectorStorageId: number;

afterAll(async () => {
  await cleanup?.();
});

beforeAll(async () => {
  const db = await setupTestDB();
  cleanup = db.cleanup;
  const drizzle = db.client;

  const pluginManager = PluginManager.get("GLOBAL", "", new TestPluginLoader());

  await pluginManager.getDiscovery().syncDefinitions(drizzle);
  await pluginManager.install(drizzle, "mock");
  await drizzle.transaction(async (tx) => {
    await pluginManager.restore(
      tx,
      // @ts-expect-error no need for hono
      {},
    );
  });

  await executeCommand({ db: drizzle }, ensureLanguages, {
    languageIds: ["en", "zh-Hans"],
  });

  await executeCommand({ db: drizzle }, createUser, {
    email: "admin@test.com",
    name: "Test User",
  });

  const project = await executeCommand({ db: drizzle }, createProject, {
    name: "Test Project",
    description: null,
    creatorId: "00000000-0000-0000-0000-000000000001",
  });
  projectId = project.id;

  const vectorizers = pluginManager.getServices("TEXT_VECTORIZER");
  const vectorStorages = pluginManager.getServices("VECTOR_STORAGE");
  vectorizerId = vectorizers[0]?.dbId ?? 1;
  vectorStorageId = vectorStorages[0]?.dbId ?? 1;

  createDefaultGraphRuntime(drizzle, pluginManager);
});

test("structured payload ingestion creates graph rows and evidence without Document", async () => {
  const { client: db } = await getDbHandle();

  const importerId = "test-importer";
  const sourceRootRef = "src/locales/en.json";
  const fileNodeRef = `source-file:${sourceRootRef}`;
  const elementRef = `element:/greeting`;

  const result = await runGraph(ingestCollectionGraph, {
    payload: {
      payloadVersion: "content-graph/v1",
      projectId,
      sourceLanguageId: "en",
      importerId,
      sourceRootRef,
      relationTypes: [],
      nodes: [
        {
          ref: fileNodeRef,
          kind: "SOURCE_COMPONENT",
          displayLabel: sourceRootRef,
          importerId,
          sourceRootRef,
          stableSourceNodeRef: fileNodeRef,
          sourcePath: sourceRootRef,
          sourceType: "json",
          exportRole: "NONE",
          boundaryType: "FILE",
        },
      ],
      elements: [
        {
          ref: elementRef,
          text: "Hello",
          languageId: "en",
          sourceNodeRef: fileNodeRef,
          stableSourceRef: `stable:/greeting`,
          localOrder: 0,
          meta: { key: ["greeting"] },
        },
      ],
      relations: [
        {
          type: { namespace: "core", name: "contains", version: "1" },
          source: { kind: "NODE", nodeRef: fileNodeRef },
          target: { kind: "ELEMENT", elementRef },
          localOrder: 0,
          isPrimary: true,
        },
      ],
      evidence: [
        {
          attachedTo: { kind: "ELEMENT", elementRef },
          kind: "SOURCE_LOCATION",
          textData: `Source: ${sourceRootRef}`,
          displayLabel: "source file",
          trustLevel: "COLLECTED",
          provenance: { extractorId: importerId, filePath: sourceRootRef },
        },
      ],
    },
    vectorizerId,
    vectorStorageId,
  });

  // contentNodeIds should have at least one (the file node)
  expect(result.contentNodeIds.length).toBeGreaterThanOrEqual(1);
  expect(result.addedCount).toBe(1);

  // Verify content node row exists
  const contentNodes = await executeQuery({ db }, listProjectContentNodes, {
    projectId,
  });
  expect(contentNodes.length).toBeGreaterThanOrEqual(1);

  // Verify translatable element was created
  const elements = await executeQuery({ db }, listAllElements, {});
  const ourElement = elements.filter((e) => e.projectId === projectId);
  expect(ourElement.length).toBe(1);
  expect(ourElement[0]?.sourceRootRef).toBe(sourceRootRef);
});
