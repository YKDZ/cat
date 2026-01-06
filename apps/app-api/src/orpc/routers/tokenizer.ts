import { authed } from "@/orpc/server.ts";
import z from "zod";
import { TokenSchema } from "@cat/plugin-core";
import { tokenizeTask } from "@cat/app-workers";

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
