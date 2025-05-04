import { PrismaClient, Prisma, TranslatableElement } from "@prisma/client";

export const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});