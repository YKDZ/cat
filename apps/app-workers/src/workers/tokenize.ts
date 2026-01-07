import { defineTask } from "@/core";
import { getDrizzleDB } from "@cat/db";
import {
  PluginRegistry,
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
    const { client: drizzle } = await getDrizzleDB();
    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const { text } = payload;

    const rules: { rule: Tokenizer; id: number }[] = await Promise.all(
      pluginRegistry
        .getPluginServices("TOKENIZER")
        .map(async ({ record, service }) => {
          const id = await pluginRegistry.getPluginServiceDbId(
            drizzle,
            record.pluginId,
            record.type,
            record.id,
          );
          return {
            rule: service,
            id,
          };
        }),
    );

    const sorted = rules.sort(
      (a, b) => b.rule.getPriority() - a.rule.getPriority(),
    );

    const tokens = await tokenize(text, sorted);

    return { tokens };
  },
});
