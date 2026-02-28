import {
  PluginManager,
  tokenize,
  Tokenizer,
  TokenSchema,
} from "@cat/plugin-core";
import { TermDataSchema } from "@cat/shared/schema/misc";
import z from "zod";

import { defineTask } from "@/core";

export const TokenizeInputSchema = z.object({
  text: z.string(),
  terms: z.array(TermDataSchema).optional(),
});

export const TokenizeOutputSchema = z.object({
  tokens: z.array(TokenSchema),
});

export const tokenizeTask = await defineTask({
  name: "tokenizer",
  input: TokenizeInputSchema,
  output: TokenizeOutputSchema,

  cache: {
    enabled: true,
  },

  handler: async (payload) => {
    const pluginManager = PluginManager.get("GLOBAL", "");

    const { text, terms } = payload;

    const rules: { service: Tokenizer; dbId: number }[] =
      pluginManager.getServices("TOKENIZER");

    const sorted = rules
      .sort((a, b) => b.service.getPriority() - a.service.getPriority())
      .map((service) => ({
        rule: service.service,
        id: service.dbId,
      }));

    const tokens = await tokenize(text, sorted, { terms });

    return { tokens };
  },
});
