import { z } from "zod/v4";
import { authedProcedure, router } from "../server";
import { prisma } from "@cat/db";
import { get } from "http";

export const settingRouter = router({
  set: authedProcedure
    .input(
      z.object({
        key: z.string(),
        value: z.json(),
      }),
    )
    .mutation(async ({ input }) => {
      const { key, value } = input;
      await prisma.setting.update({
        where: {
          key,
        },
        data: {
          value,
        },
      });
    }),
  get: authedProcedure
    .input(
      z.object({
        key: z.string(),
      }),
    )
    .output(z.json())
    .query(async ({ input }) => {
      const { key } = input;

      return z
        .json()
        .nullable()
        .parse(
          (
            await prisma.setting.findUnique({
              where: {
                key,
              },
              select: {
                value: true,
              },
            })
          )?.value ?? null,
        );
    }),
});
