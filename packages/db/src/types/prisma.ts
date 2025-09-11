import type { ITXClientDenyList } from "@prisma/client/runtime/client";
import type { PrismaClient } from "../generated/prisma/client.ts";

export type OverallPrismaClient = Omit<PrismaClient, ITXClientDenyList>;
