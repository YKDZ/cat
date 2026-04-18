import {
  executeQuery,
  findOpenAutoTranslatePR,
  getElementWithChunkIds,
  getProjectSettings,
  listMemoryIdsByProject,
} from "@cat/domain";
import { readWithOverlay } from "@cat/vcs";
import * as z from "zod/v4";

import { authed, checkElementPermission } from "@/orpc/server";

export const suggest = authed
  .input(
    z.object({
      /** DB ID of the element being translated */
      elementId: z.int(),
      /** BCP-47 language tag of the target language */
      languageId: z.string(),
      /** Text the translator has already typed */
      currentInput: z.string(),
      /** Cursor position within currentInput */
      cursorPosition: z.int(),
      /** Translation memory hints (pre-fetched by the frontend, optional) */
      memoryHints: z.string().optional(),
      /** Glossary term hints (pre-fetched by the frontend, optional) */
      termHints: z.string().optional(),
      /** Serialised neighbouring translated segments (optional) */
      neighborElements: z.string().optional(),
    }),
  )
  .use(checkElementPermission("viewer"), (i) => i.elementId)
  .handler(async function* ({
    context,
    input,
  }): AsyncGenerator<{ text: string }> {
    const {
      drizzleDB: { client: db },
    } = context;
    const { elementId, languageId } = input;

    // 1. Get element info (projectId, source text, source language)
    const elem = await executeQuery({ db }, getElementWithChunkIds, {
      elementId,
    });
    if (!elem) return;

    const { projectId } = elem;

    // 2. Find auto-translate PR for this language and read overlay
    const pr = await executeQuery({ db }, findOpenAutoTranslatePR, {
      projectId,
      languageId,
    });

    if (pr) {
      const entityId = `element:${elementId}:lang:${languageId}`;
      const overlay = await readWithOverlay(
        db,
        pr.branchId,
        "auto_translation",
        entityId,
      );

      if (overlay?.data) {
        const payload = overlay.data as { text?: string };
        if (payload.text) {
          yield { text: payload.text };
          return;
        }
      }
    }

    // 3. Fallback based on project settings
    const settings = await executeQuery({ db }, getProjectSettings, {
      projectId,
    });

    if (settings.ghostTextFallback === "first-memory") {
      try {
        const { collectMemoryRecallOp } = await import("@cat/operations");

        const memoryIds = await executeQuery({ db }, listMemoryIdsByProject, {
          projectId,
        });

        if (memoryIds.length > 0) {
          const results = await collectMemoryRecallOp({
            text: elem.value,
            sourceLanguageId: elem.languageId,
            translationLanguageId: languageId,
            memoryIds,
            maxAmount: 1,
          });

          const top = results[0];
          if (top) {
            yield { text: top.adaptedTranslation ?? top.translation };
            return;
          }
        }
      } catch {
        // Fallback failed silently — return nothing
      }
    }

    // ghostTextFallback === "none" or no result: yield nothing
  });
