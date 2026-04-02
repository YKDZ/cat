import { z } from "zod";

// Config
export const AutodocConfigSchema = z.object({
  packages: z.array(
    z.object({
      path: z.string(),
      name: z.string(),
      priority: z.enum(["high", "medium", "low"]).default("medium"),
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
    }),
  ),
  output: z.object({
    path: z.string().default("apps/docs/src/autodoc"),
    format: z.enum(["markdown", "json"]).default("markdown"),
  }),
  llmsTxt: z.object({
    enabled: z.boolean().default(true),
  }),
});

export type AutodocConfig = z.infer<typeof AutodocConfigSchema>;

/**
 * @zh 定义 autodoc 配置的帮助函数，提供类型推导。
 * @en Helper for defining autodoc config with full type inference.
 */
export const defineConfig = (config: AutodocConfig): AutodocConfig => config;
