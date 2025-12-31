import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { ssc } from "@/server/ssc";

export const data = async (ctx: PageContextServer) => {
  const { user } = ctx;

  if (!user) throw render("/", `You must login to access`);

  try {
    const memories = await ssc(ctx).memory.getUserOwned({
      userId: user.id,
    });

    return { memories };
  } catch {
    throw render("/", `Error loading memories`);
  }
};

export type Data = Awaited<ReturnType<typeof data>>;
