import { eq, getDrizzleDB, glossary, term, termRelation } from "@cat/db";
import {
  assertFirstNonNullish,
  assertSingleNonNullish,
} from "@cat/shared/utils";
import { TermDataSchema } from "@cat/shared/schema/misc";
import { Queue, Worker } from "bullmq";
import * as z from "zod/v4";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/utils/worker.ts";
import { PluginRegistry } from "@cat/plugin-core";
import { createStringFromData } from "@cat/app-server-shared/utils";

const { client: drizzle } = await getDrizzleDB();

const queueId = "insertTerms";

export const insertTermsQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const { glossaryId, termsData, creatorId } = z
      .object({
        glossaryId: z.uuidv7(),
        termsData: z.array(TermDataSchema),
        creatorId: z.uuidv7(),
      })
      .parse(job.data);

    if (termsData.length === 0) return;

    assertSingleNonNullish(
      await drizzle
        .select({
          id: glossary.id,
        })
        .from(glossary)
        .where(eq(glossary.id, glossaryId))
        .limit(1),
      `Glossary ${glossaryId} not found`,
    );

    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    // TODO 配置
    const vectorStorage = assertFirstNonNullish(
      await pluginRegistry.getPluginServices(drizzle, "VECTOR_STORAGE"),
    );

    // TODO 配置
    const vectorizer = assertFirstNonNullish(
      await pluginRegistry.getPluginServices(drizzle, "TEXT_VECTORIZER"),
    );

    const { service: termService } = (await pluginRegistry.getPluginService(
      drizzle,
      "es-term-service",
      "TERM_SERVICE",
      "ES",
    ))!;

    await drizzle.transaction(async (tx) => {
      const termInputs = termsData.map(({ term, termLanguageId }) => ({
        value: term,
        languageId: termLanguageId,
      }));

      const translationInputs = termsData.map(
        ({ translation, translationLanguageId }) => ({
          value: translation,
          languageId: translationLanguageId,
        }),
      );

      const termStringIds = await createStringFromData(
        tx,
        vectorizer.service,
        vectorizer.id,
        vectorStorage.service,
        vectorStorage.id,
        termInputs,
      );

      const translationStringIds = await createStringFromData(
        tx,
        vectorizer.service,
        vectorizer.id,
        vectorStorage.service,
        vectorStorage.id,
        translationInputs,
      );

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

      await tx.insert(termRelation).values(
        termsData.map((_, index) => ({
          termId: termRows[index].id,
          translationId: translationRows[index].id,
        })),
      );

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
    });
  },
  {
    ...config,
  },
);

registerTaskUpdateHandlers(drizzle, worker, queueId);
