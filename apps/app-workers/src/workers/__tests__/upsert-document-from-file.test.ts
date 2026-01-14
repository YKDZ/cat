import { afterAll, beforeAll, expect, test } from "vitest";
import {
  blob,
  document,
  eq,
  file,
  getDrizzleDB,
  language,
  project,
  translatableElement,
  user,
} from "@cat/db";
import { PluginManager } from "@cat/plugin-core";
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

  const pluginManager = PluginManager.get("GLOBAL", "", new TestPluginLoader());

  await pluginManager.getDiscovery().syncDefinitions(drizzle);
  await pluginManager.install(drizzle, "mock");
  await drizzle.transaction(async (tx) => {
    await pluginManager.restore(
      tx, // @ts-expect-error no need for hono
      {},
    );
  });

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
  const pluginManager = PluginManager.get("GLOBAL", "");

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
    pluginManager.getServices("STORAGE_PROVIDER"),
  );
  const vectorStorage = assertSingleNonNullish(
    pluginManager.getServices("VECTOR_STORAGE"),
  );
  const vectorizer = assertSingleNonNullish(
    pluginManager.getServices("TEXT_VECTORIZER"),
  );

  const fileContent = "Line 1\nLine 2\nLine 3";
  const key = `test-file-${Date.now()}.txt`;

  await storageProvider.service.putStream({
    key,
    stream: Readable.from(Buffer.from(fileContent)),
  });

  const { id: blobId } = assertSingleNonNullish(
    await drizzle
      .insert(blob)
      .values({
        key,
        storageProviderId: storageProvider.dbId,
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
    vectorizerId: vectorizer.dbId,
    vectorStorageId: vectorStorage.dbId,
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
