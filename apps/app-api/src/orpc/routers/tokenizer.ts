import { tokenizeTask } from "@cat/app-workers";
import { TokenSchema } from "@cat/plugin-core";
import { TermDataSchema } from "@cat/shared/schema/misc";
import z from "zod";

import { authed } from "@/orpc/server.ts";

export const tokenize = authed
  .input(
    z.object({
      text: z.string(),
      terms: z.array(TermDataSchema).optional(),
    }),
  )
  .output(z.array(TokenSchema))
  .handler(async ({ input }) => {
    const { text, terms } = input;

    const { result } = await tokenizeTask.run({
      text,
      terms,
    });

    const { tokens } = await result();

    return tokens;
  });
