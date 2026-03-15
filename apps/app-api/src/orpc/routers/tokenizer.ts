import { tokenizeTask } from "@cat/app-agent/workflow";
import { lookupTermsForElementOp } from "@cat/operations";
import { TokenSchema } from "@cat/plugin-core";
import z from "zod";

import { authed } from "@/orpc/server.ts";

export const tokenize = authed
  .input(
    z.object({
      text: z.string(),
      elementId: z.int().optional(),
      translationLanguageId: z.string().optional(),
    }),
  )
  .output(
    z.object({
      tokens: z.array(TokenSchema),
    }),
  )
  .handler(async ({ input }) => {
    const { text, elementId, translationLanguageId } = input;

    // 当同时提供 elementId 和 translationLanguageId 时，后端自动查找术语
    const terms =
      elementId !== undefined && translationLanguageId !== undefined
        ? await lookupTermsForElementOp(elementId, translationLanguageId)
        : [];

    const { result } = await tokenizeTask.run({
      text,
      terms,
    });

    const { tokens } = await result();

    return { tokens };
  });
