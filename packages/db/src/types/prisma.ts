import { ITXClientDenyList } from "@prisma/client/runtime/client";
import { PrismaClient } from "../generated/prisma/client";

export type OverallPrismaClient = Omit<PrismaClient, ITXClientDenyList>;
