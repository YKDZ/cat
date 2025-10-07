import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { useSSCTRPC } from "@cat/app-api/trpc/sscClient";

export const data = async (ctx: PageContextServer) => {
  const { user } = ctx;

  if (!user) throw render("/", `You must login to access`);

  const glossaries = await useSSCTRPC(ctx).glossary.listUserOwned({
    userId: user.id,
  });

  return { glossaries };
};

export type Data = Awaited<ReturnType<typeof data>>;
