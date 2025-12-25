import * as z from "zod/v4";
import { JSONSchemaSchema } from "@/schema/json.ts";
import { PluginServiceTypeSchema } from "@/schema/drizzle/enum";

export const PluginManifestSchema = z.object({
  id: z
    .string()
    .regex(
      /^(?:[A-Za-z0-9\-_.!~*'()]+|%[0-9A-Fa-f]{2})+$/,
      "The plugin ID does not meet the requirements. It needs to be a string that can be used for URL fragments",
    ),
  version: z.string(),
  entry: z.string(),
  iconURL: z.url().optional(),
  services: z
    .array(
      z.object({
        id: z.string(),
        type: PluginServiceTypeSchema,
      }),
    )
    .optional(),
  components: z
    .array(
      z.object({
        id: z.string(),
        slot: z.string(),
        url: z.string(),
        skeletion: z.string().optional(),
      }),
    )
    .optional(),
  config: JSONSchemaSchema.optional(),
});

export const PluginDataSchema = PluginManifestSchema.extend({
  name: z.string().lowercase(),
  version: z.string(),
  overview: z.string().nullable(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;
export type PluginData = z.infer<typeof PluginDataSchema>;
