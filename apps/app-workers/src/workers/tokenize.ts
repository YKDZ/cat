import { defineTask } from "@/core";
import {
  PluginManager,
  tokenize,
  Tokenizer,
  TokenSchema,
} from "@cat/plugin-core";
import z from "zod";

export const TokenizeInputSchema = z.object({
  text: z.string(),
});

export const TokenizeOutputSchema = z.object({
  tokens: z.array(TokenSchema),
});

export const tokenizeTask = await defineTask({
  name: "tokenizer",
  input: TokenizeInputSchema,
  output: TokenizeOutputSchema,

  handler: async (payload) => {
    const pluginManager = PluginManager.get("GLOBAL", "");

    const { text } = payload;

    const rules: { service: Tokenizer; dbId: number }[] =
      pluginManager.getServices("TOKENIZER");

    const sorted = rules
      .sort((a, b) => b.service.getPriority() - a.service.getPriority())
      .map((service) => ({
        rule: service.service,
        id: service.dbId,
      }));

    const tokens = await tokenize(text, sorted);

    return { tokens };
  },
});
