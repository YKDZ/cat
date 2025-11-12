import { eq, getDrizzleDB, glossary, term, termRelation } from "@cat/db";
import {
  assertFirstNonNullish,
  assertSingleNonNullish,
} from "@cat/shared/utils";
import { TermDataSchema } from "@cat/shared/schema/misc";
import * as z from "zod/v4";
import { PluginRegistry } from "@cat/plugin-core";
import { createStringFromData } from "@cat/app-server-shared/utils";
import { defineWorker } from "@/utils";

const { client: drizzle } = await getDrizzleDB();

const id = "insert-term";

declare module "../core/registry" {
  interface WorkerInputTypeMap {
    [id]: InsertTermsInput;
  }
}

const InsertTermsInputSchema = z.object({
  glossaryId: z.uuidv7(),
  termsData: z.array(TermDataSchema),
  creatorId: z.uuidv7(),
});

type InsertTermsInput = z.infer<typeof InsertTermsInputSchema>;

/**
 * 验证词汇表是否存在
 */
async function validateGlossaryExists(glossaryId: string): Promise<void> {
  assertSingleNonNullish(
    await drizzle
      .select({ id: glossary.id })
      .from(glossary)
      .where(eq(glossary.id, glossaryId))
      .limit(1),
    `Glossary ${glossaryId} not found`,
  );
}

/**
 * 插入术语及其翻译
 */
async function insertTermsWithTranslations(
  input: InsertTermsInput,
): Promise<{ termCount: number; translationCount: number }> {
  const { glossaryId, termsData, creatorId } = input;

  const pluginRegistry = PluginRegistry.get("GLOBAL", "");

  // 获取向量存储服务
  const vectorStorage = assertFirstNonNullish(
    await pluginRegistry.getPluginServices(drizzle, "VECTOR_STORAGE"),
  );

  // 获取向量化服务
  const vectorizer = assertFirstNonNullish(
    await pluginRegistry.getPluginServices(drizzle, "TEXT_VECTORIZER"),
  );

  // 获取术语服务
  const { service: termService } = (await pluginRegistry.getPluginService(
    drizzle,
    "es-term-service",
    "TERM_SERVICE",
    "ES",
  ))!;

  return await drizzle.transaction(async (tx) => {
    // 准备术语字符串数据
    const termInputs = termsData.map(({ term, termLanguageId }) => ({
      value: term,
      languageId: termLanguageId,
    }));

    // 准备翻译字符串数据
    const translationInputs = termsData.map(
      ({ translation, translationLanguageId }) => ({
        value: translation,
        languageId: translationLanguageId,
      }),
    );

    // 创建术语字符串并生成向量
    const termStringIds = await createStringFromData(
      tx,
      vectorizer.service,
      vectorizer.id,
      vectorStorage.service,
      vectorStorage.id,
      termInputs,
    );

    // 创建翻译字符串并生成向量
    const translationStringIds = await createStringFromData(
      tx,
      vectorizer.service,
      vectorizer.id,
      vectorStorage.service,
      vectorStorage.id,
      translationInputs,
    );

    // 插入术语
    const termRows = await tx
      .insert(term)
      .values(
        termsData.map((data, index) => ({
          value: data.term,
          languageId: data.termLanguageId,
          stringId: termStringIds[index],
          glossaryId,
          creatorId,
        })),
      )
      .returning({ id: term.id });

    // 插入翻译
    const translationRows = await tx
      .insert(term)
      .values(
        termsData.map((data, index) => ({
          value: data.translation,
          languageId: data.translationLanguageId,
          stringId: translationStringIds[index],
          glossaryId,
          creatorId,
        })),
      )
      .returning({ id: term.id });

    // 创建术语-翻译关系
    await tx.insert(termRelation).values(
      termsData.map((_, index) => ({
        termId: termRows[index].id,
        translationId: translationRows[index].id,
      })),
    );

    // 将术语索引到搜索服务
    await termService.termStore.insertTerms(
      termsData.map(
        ({ term, termLanguageId, translationLanguageId }, index) => ({
          term,
          termLanguageId,
          translationLanguageId,
          translationId: translationRows[index].id,
        }),
      ),
    );

    return {
      termCount: termRows.length,
      translationCount: translationRows.length,
    };
  });
}

export const insertTermsWorker = defineWorker({
  id,
  taskType: id,
  inputSchema: InsertTermsInputSchema,

  async execute(ctx) {
    const { termsData, glossaryId } = ctx.input;

    // 快速返回：如果没有术语需要插入
    if (termsData.length === 0) {
      return {
        termCount: 0,
        translationCount: 0,
        message: "No terms to insert",
      };
    }

    // 验证词汇表存在
    await validateGlossaryExists(glossaryId);

    // 插入术语及翻译
    const result = await insertTermsWithTranslations(ctx.input);

    return {
      ...result,
      glossaryId,
    };
  },
});
