import { EMPTY_CONTEXT } from "@/server/trpc/context";
import { glossaryRouter } from "@/server/trpc/routers/glossary";
import { createCallerFactory } from "@/server/trpc/server";
import { useSSCTRPC } from "@/server/trpc/sscClient";
import { redirect } from "vike/abort";
import type { PageContextServer } from "vike/types";

export const data = async (ctx: PageContextServer) => {
  const { user } = ctx;

  if (!user) throw redirect("/");

  const glossaries = await useSSCTRPC(ctx)
    .glossary.listUserOwned({ userId: user.id })
    .catch(() => {
      throw redirect("/");
    });

  return { glossaries };
};

export type Data = Awaited<ReturnType<typeof data>>;
