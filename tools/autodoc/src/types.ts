import { z } from "zod";

// Function signature info
export const FunctionSignatureSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      description: z.string().optional(),
      optional: z.boolean().default(false),
    }),
  ),
  returnType: z.string().optional(),
  returnDescription: z.string().optional(),
  isExported: z.boolean(),
  isAsync: z.boolean(),
});

export type FunctionSignature = z.infer<typeof FunctionSignatureSchema>;

// Type definition info
export const TypeDefinitionSchema = z.object({
  name: z.string(),
  kind: z.enum(["interface", "type", "enum"]),
  description: z.string().optional(),
  properties: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      description: z.string().optional(),
      optional: z.boolean().default(false),
    }),
  ),
  isExported: z.boolean(),
});

export type TypeDefinition = z.infer<typeof TypeDefinitionSchema>;

// Module info
export const ModuleInfoSchema = z.object({
  path: z.string(),
  relativePath: z.string(),
  functions: z.array(FunctionSignatureSchema),
  types: z.array(TypeDefinitionSchema),
  exports: z.array(z.string()),
  imports: z.array(
    z.object({
      module: z.string(),
      names: z.array(z.string()),
    }),
  ),
});

export type ModuleInfo = z.infer<typeof ModuleInfoSchema>;

// Package info
export const PackageInfoSchema = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string().optional(),
  modules: z.array(ModuleInfoSchema),
});

export type PackageInfo = z.infer<typeof PackageInfoSchema>;

// Config
export const AutodocConfigSchema = z.object({
  packages: z.array(
    z.object({
      path: z.string(),
      name: z.string(),
      description: z.string().optional(),
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
