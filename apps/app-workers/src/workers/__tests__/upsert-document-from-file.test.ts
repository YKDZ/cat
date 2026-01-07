import { afterAll, beforeAll, expect, test } from "vitest";
import {
  blob,
  document,
  eq,
  file,
  getDrizzleDB,
  language,
  pluginService,
  project,
  translatableElement,
  user,
} from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { upsertDocumentFromFileWorkflow } from "../upsert-document-from-file";
import { Readable } from "node:stream";

let cleanup: () => Promise<void>;

afterAll(async () => {
  await cleanup?.();
});

beforeAll(async () => {
  const db = await setupTestDB();
  cleanup = db.cleanup;
  const drizzle = db.client;

  const pluginRegistry = PluginRegistry.get(
    "GLOBAL",
    "",
    new TestPluginLoader(),
  );

  await pluginRegistry.importAvailablePlugins(drizzle);
  await pluginRegistry.installPlugin(drizzle, "mock");
  // @ts-expect-error no need for hono here
  await pluginRegistry.enableAllPlugins(drizzle, {});

  // Seed
  await drizzle.transaction(async (tx) => {
    await tx.insert(language).values([
      {
        id: "en",
      },
      {
        id: "zh-Hans",
      },
    ]);

    const { id: userId } = assertSingleNonNullish(
      await tx
        .insert(user)
        .values({
          email: "admin@encmys.cn",
          name: "YKDZ",
        })
        .returning({ id: user.id }),
    );

    assertSingleNonNullish(
      await tx
        .insert(project)
        .values({
          name: "Test Project",
          creatorId: userId,
        })
        .returning({
          id: project.id,
        }),
    );
  });
});

test("worker should upsert document from file", async () => {
  const { client: drizzle } = await getDrizzleDB();
  const pluginRegistry = PluginRegistry.get("GLOBAL", "");

  // 1. Setup Document
  const [projectData] = await drizzle.select().from(project).limit(1);
  if (!projectData) throw new Error("Project not found");
  const [userData] = await drizzle.select().from(user).limit(1);
  if (!userData) throw new Error("User not found");

  const { id: documentId } = assertSingleNonNullish(
    await drizzle
      .insert(document)
      .values({
        creatorId: userData.id,
        projectId: projectData.id,
      })
      .returning({
        id: document.id,
      }),
  );

  const storageProvider = assertSingleNonNullish(
    pluginRegistry
      .getPluginServices("STORAGE_PROVIDER")
      .filter((p) => p.service.getId() === "storage-provider"),
  ).service;

  const [storageService] = await drizzle
    .select()
    .from(pluginService)
    .where(eq(pluginService.serviceId, "storage-provider"))
    .limit(1);

  if (!storageService) throw new Error("Storage service not found in DB");

  const fileContent = "Line 1\nLine 2\nLine 3";
  const key = `test-file-${Date.now()}.txt`;

  await storageProvider.putStream({
    key,
    stream: Readable.from(Buffer.from(fileContent)),
  });

  const { id: blobId } = assertSingleNonNullish(
    await drizzle
      .insert(blob)
      .values({
        key,
        storageProviderId: storageService.id,
        hash: Buffer.alloc(32),
      })
      .returning({ id: blob.id }),
  );

  const { id: fileId } = assertSingleNonNullish(
    await drizzle
      .insert(file)
      .values({
        name: "test.txt",
        blobId,
        isActive: true,
      })
      .returning({ id: file.id }),
  );

  const { result } = await upsertDocumentFromFileWorkflow.run({
    documentId,
    fileId,
    languageId: "en",
  });

  const output = await result();

  expect(output.success).toBe(true);
  expect(output.addedCount).toBe(3);
  expect(output.removedCount).toBe(0);

  const elements = await drizzle
    .select()
    .from(translatableElement)
    .where(eq(translatableElement.documentId, documentId));

  expect(elements).toHaveLength(3);
});
