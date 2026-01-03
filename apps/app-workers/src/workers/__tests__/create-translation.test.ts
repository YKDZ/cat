import { beforeAll, expect, test } from "vitest";
import {
  document,
  getDrizzleDB,
  language,
  memory,
  project,
  translatableElement,
  user,
} from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { assertSingleNonNullish, zip } from "@cat/shared/utils";
import { setupTestDB, TestPluginLoader } from "@cat/test-utils";
import { createTranslationWorkflow } from "../create-translation.ts";
import { createElementWorkflow } from "../create-element.ts";

const data = [
  {
    text: "Hello World!",
    languageId: "en",
    meta: {},
    translation: {
      text: "你好世界",
      languageId: "zh-Hans",
    },
  },
  {
    text: "这是一个设计时就以 LLM 为核心的系统",
    languageId: "zh-Hans",
    meta: {},
    translation: {
      text: "This is a system that was designed with LLM at its core",
      languageId: "en",
    },
  },
  {
    text: "这个系统的设计原则是 “将一切人类参与的过程视为资源”",
    languageId: "zh-Hans",
    meta: {},
    translation: {
      text: 'The design principle of this system is to "regard all human-involved processes as resources"',
      languageId: "en",
    },
  },
  {
    text: "这个系统的设计目标是，用所有资源提高自动本地化时的产物质量",
    languageId: "zh-Hans",
    meta: {},
    translation: {
      text: "The design goal of this system is to use all resources to improve the quality of automatic localization products",
      languageId: "en",
    },
  },
];

beforeAll(async () => {
  const { client: drizzle } = await setupTestDB();

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

    const { id: projectId } = assertSingleNonNullish(
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

    await tx
      .insert(document)
      .values({
        creatorId: userId,
        projectId,
      })
      .returning({
        id: document.id,
      });

    await tx.insert(memory).values({
      name: "Test",
      creatorId: userId,
    });
  });
});

test("prepare elements", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const { documentId } = assertSingleNonNullish(
    await drizzle
      .select({
        documentId: document.id,
      })
      .from(document)
      .limit(1),
  );

  const { result } = await createElementWorkflow.run({
    data: data.map((d) => ({
      ...d,
      documentId,
    })),
  });

  const { elementIds } = await result();

  expect(elementIds.length).toEqual(data.length);
});

test("worker should create translation and return ids in order", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const elements = await drizzle
    .select({
      id: translatableElement.id,
    })
    .from(translatableElement);

  const { result } = await createTranslationWorkflow.run({
    data: Array.from(zip(elements, data)).map(([element, datum]) => ({
      translatableElementId: element.id,
      ...datum,
    })),
    memoryIds: [],
  });

  const { translationIds, memoryItemIds } = await result();

  expect(translationIds.length).toEqual(data.length);
  expect(memoryItemIds.length).toEqual(0);
});

test("worker should create memory when memoryIds are provided", async () => {
  const { client: drizzle } = await getDrizzleDB();

  const elements = await drizzle
    .select({
      id: translatableElement.id,
    })
    .from(translatableElement);

  expect(elements.length).toEqual(data.length);

  const { id: memoryId } = assertSingleNonNullish(
    await drizzle
      .select({
        id: memory.id,
      })
      .from(memory),
  );

  expect(memoryId).toBeDefined();

  const { result } = await createTranslationWorkflow.run({
    data: Array.from(zip(elements, data)).map(([element, datum]) => ({
      translatableElementId: element.id,
      ...datum,
    })),
    memoryIds: [memoryId],
  });

  const { translationIds, memoryItemIds } = await result();

  expect(translationIds.length).toEqual(data.length);
  expect(memoryItemIds.length).toEqual(data.length);
});
