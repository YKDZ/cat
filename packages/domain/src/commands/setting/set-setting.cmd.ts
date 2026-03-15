import type { NonNullJSONType } from "@cat/shared/schema/json";

import { eq, setting } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

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
