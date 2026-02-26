import { tokenizeTask } from "@cat/app-workers";
import { TokenSchema } from "@cat/plugin-core";
import z from "zod";

import { authed } from "@/orpc/server.ts";

export const tokenize = authed
  .input(
    z.object({
      text: z.string(),
    }),
  )
  .output(z.array(TokenSchema))
  .handler(async ({ input }) => {
    const { text } = input;

    const { result } = await tokenizeTask.run({
      text,
    });

    const { tokens } = await result();

    return tokens;
  });
