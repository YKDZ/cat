import { defineWorkflow } from "@/core";
import {
  alias,
  document,
  eq,
  getDrizzleDB,
  getRedisDB,
  glossaryToProject,
  project,
  qaResult,
  qaResultItem,
  translatableElement,
  translatableString,
  translation,
} from "@cat/db";
import z from "zod";
import { tokenizeTask } from "./tokenize";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { getQAPubKey, QAPubPayloadSchema, qaWorkflow } from "./qa";

export const qaTranslationWorkflow = await defineWorkflow({
  name: "qa.translation",
  input: z.object({
    translationId: z.int(),
  }),
  output: z.object({}),

  dependencies: async (payload, { traceId }) => {
    const { client: drizzle } = await getDrizzleDB();

    const translationString = alias(translatableString, "translationString");
    const elementString = alias(translatableString, "elementString");

    const data = assertSingleNonNullish(
      await drizzle
        .select({
          translationText: translationString.value,
          elementText: elementString.value,
        })
        .from(translation)
        .innerJoin(
          translationString,
          eq(translationString.id, translation.stringId),
        )
        .innerJoin(
          translatableElement,
          eq(translatableElement.id, translation.translatableElementId),
        )
        .innerJoin(
          elementString,
          eq(elementString.id, translatableElement.translatableStringId),
        )
        .where(eq(translation.id, payload.translationId)),
    );

    return [
      await tokenizeTask.asChild(
        {
          text: data.translationText,
        },
        { traceId, taskId: "translation" },
      ),
      await tokenizeTask.asChild(
        {
          text: data.elementText,
        },
        { traceId, taskId: "element" },
      ),
    ];
  },

  handler: async (payload, { getTaskResult, traceId }) => {
    const { client: drizzle } = await getDrizzleDB();
    const { redisSub } = await getRedisDB();

    const [translationResult] = getTaskResult(tokenizeTask, "translation");
    const [elementResult] = getTaskResult(tokenizeTask, "element");

    const { data, resultId, glossaryIds } = await drizzle.transaction(
      async (tx) => {
        const translationString = alias(
          translatableString,
          "translationString",
        );
        const elementString = alias(translatableString, "elementString");

        const data = assertSingleNonNullish(
          await tx
            .select({
              elementText: elementString.value,
              elementLanguageId: elementString.languageId,
              translationText: translationString.value,
              translationLanguageId: translationString.languageId,
              projectId: project.id,
            })
            .from(translation)
            .innerJoin(
              translationString,
              eq(translationString.id, translation.stringId),
            )
            .innerJoin(
              translatableElement,
              eq(translatableElement.id, translation.translatableElementId),
            )
            .innerJoin(
              elementString,
              eq(elementString.id, translatableElement.translatableStringId),
            )
            .innerJoin(
              document,
              eq(document.id, translatableElement.documentId),
            )
            .innerJoin(project, eq(document.projectId, project.id))
            .where(eq(translation.id, payload.translationId)),
        );

        const { id: resultId } = assertSingleNonNullish(
          await tx
            .insert(qaResult)
            .values({
              translationId: payload.translationId,
            })
            .returning({
              id: qaResult.id,
            }),
        );

        const glossaryIds = (
          await tx
            .select({ id: glossaryToProject.glossaryId })
            .from(glossaryToProject)
            .where(eq(glossaryToProject.projectId, data.projectId))
        ).map((r) => r.id);

        return { data, resultId, glossaryIds };
      },
    );

    const onNewQa = async (message: string) => {
      const { result } = QAPubPayloadSchema.parse(JSON.parse(message));

      if (result.length === 0) {
        return;
      }

      await drizzle.insert(qaResultItem).values(
        result.map((item) => ({
          isPassed: item.isPassed,
          checkerId: item.checkerId,
          resultId,
          meta: item.meta,
        })),
      );
    };
    await redisSub.subscribe(getQAPubKey(traceId), onNewQa);

    await qaWorkflow.run(
      {
        source: {
          text: data.elementText,
          tokens: elementResult.tokens,
          languageId: data.elementLanguageId,
        },
        translation: {
          text: data.translationText,
          tokens: translationResult.tokens,
          languageId: data.translationLanguageId,
        },
        glossaryIds,
        pub: true,
      },
      {
        traceId,
      },
    );

    return {};
  },
});
