import type { JSONType } from "@cat/shared";

import { translatableElementContext } from "@cat/db";
import { TranslatableElementContextTypeValues } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

const ContextTypeSchema = z.enum(
  // oxlint-disable-next-line no-unsafe-type-assertion
  TranslatableElementContextTypeValues as unknown as [string, ...string[]],
);

export const InsertElementContextsCommandSchema = z.object({
  data: z.array(
    z.object({
      type: ContextTypeSchema,
      translatableElementId: z.int(),
      textData: z.string().nullable().optional(),
      jsonData: z.unknown().optional(),
      fileId: z.int().nullable().optional(),
      storageProviderId: z.int().nullable().optional(),
    }),
  ),
});

export type InsertElementContextsCommand = z.infer<
  typeof InsertElementContextsCommandSchema
>;

export const insertElementContexts: Command<
  InsertElementContextsCommand
> = async (ctx, command) => {
  if (command.data.length === 0) {
    return { result: undefined, events: [] };
  }

  await ctx.db.insert(translatableElementContext).values(
    command.data.map((item) => ({
      // oxlint-disable-next-line no-unsafe-type-assertion
      type: item.type as (typeof translatableElementContext.$inferInsert)["type"],
      translatableElementId: item.translatableElementId,
      textData: item.textData ?? null,
      // oxlint-disable-next-line no-unsafe-type-assertion
      jsonData: (item.jsonData ?? null) as JSONType | null,
      fileId: item.fileId ?? null,
      storageProviderId: item.storageProviderId ?? null,
    })),
  );

  return { result: undefined, events: [] };
};
