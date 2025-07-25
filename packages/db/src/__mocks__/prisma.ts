import { beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "../generated/prisma/client";

beforeEach(() => {
  mockReset(prisma);
});

export const prisma = mockDeep<PrismaClient>();
