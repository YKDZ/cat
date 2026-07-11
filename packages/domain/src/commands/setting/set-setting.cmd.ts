import { eq, setting } from "@cat/db";
import type { NonNullJSONType } from "@cat/shared";
import * as z from "zod";

import { domainEvent } from "#/events/domain-events.ts";
import type { Command } from "#/types.ts";

export const SetSettingCommandSchema = z.object({
  key: z.string(),
  value: z.custom<NonNullJSONType>(),
});

export type SetSettingCommand = z.infer<typeof SetSettingCommandSchema>;

export const setSetting: Command<SetSettingCommand> = async (ctx, command) => {
  await ctx.db
    .update(setting)
    .set({ value: command.value })
    .where(eq(setting.key, command.key));

  return {
    result: undefined,
    events: [domainEvent("setting:updated", { key: command.key })],
  };
};
