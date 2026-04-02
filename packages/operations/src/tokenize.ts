import type { OperationContext } from "@cat/domain";

import { tokenize, type Tokenizer, TokenSchema } from "@cat/plugin-core";
import { resolvePluginManager } from "@cat/server-shared";
import { TermDataSchema } from "@cat/shared/schema/misc";
import z from "zod";

export const TokenizeInputSchema = z.object({
  text: z.string(),
  terms: z.array(TermDataSchema).optional().meta({
    description:
      "Known terms to guide tokenizer boundary decisions. Omit if no term context is available.",
  }),
});

export const TokenizeOutputSchema = z.object({
  tokens: z.array(TokenSchema),
});

export type TokenizeInput = z.infer<typeof TokenizeInputSchema>;
export type TokenizeOutput = z.infer<typeof TokenizeOutputSchema>;

/**
 * @zh 文本分词。
 *
 * 按优先级对所有已注册的 TOKENIZER 插件依次分词。
 * @en Tokenize text.
 *
 * Runs all registered TOKENIZER plugins in priority order.
 *
 * @param payload - {@zh 分词输入参数} {@en Tokenization input parameters}
 * @param ctx - {@zh 操作上下文} {@en Operation context}
 * @returns - {@zh 分词 token 列表（支持树形结构）} {@en Token list (supports tree structure)}
 */
export const tokenizeOp = async (
  payload: TokenizeInput,
  ctx?: OperationContext,
): Promise<TokenizeOutput> => {
  const pluginManager = resolvePluginManager(ctx?.pluginManager);

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
};
