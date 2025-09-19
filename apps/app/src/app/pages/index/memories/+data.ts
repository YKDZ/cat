import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { useSSCTRPC } from "@cat/app-api/trpc/sscClient";

export const data = async (ctx: PageContextServer) => {
  const { user } = ctx;

  if (!user) throw render("/", `You must login to access`);

  try {
    const memories = await useSSCTRPC(ctx).memory.listUserOwned({
      userId: user.id,
    });

    return { memories };
  } catch {
    throw render("/", `Error loading memories`);
  }
};

export type Data = Awaited<ReturnType<typeof data>>;
