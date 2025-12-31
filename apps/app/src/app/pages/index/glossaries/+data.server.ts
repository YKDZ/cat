import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { ssc } from "@/server/ssc";

export const data = async (ctx: PageContextServer) => {
  const { user } = ctx;

  if (!user) throw render("/", `You must login to access`);

  const glossaries = await ssc(ctx).glossary.getUserOwned({
    userId: user.id,
  });

  return { glossaries };
};

export type Data = Awaited<ReturnType<typeof data>>;
