import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import { useSSCTRPC } from "@/server/trpc/sscClient.ts";

export const data = async (ctx: PageContextServer) => {
  const { user } = ctx;

  if (!user) throw render("/", `You must login to access`);

  try {
    const glossaries = await useSSCTRPC(ctx).glossary.listUserOwned({
      userId: user.id,
    });

    return { glossaries };
  } catch {
    // TODO 错误处理
    throw render("/", `Error when fetching glossaries`);
  }
};

export type Data = Awaited<ReturnType<typeof data>>;
