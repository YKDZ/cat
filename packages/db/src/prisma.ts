import { PrismaClient } from "./generated/prisma";
import "dotenv/config";

export class PrismaDB {
  public static instance: PrismaDB;
  public client: PrismaClient;

  constructor() {
    if (PrismaDB.instance)
      throw Error("PrismaDB can only have a single instance");

    this.client = new PrismaClient();
    PrismaDB.instance = this;
  }

  static async connect() {
    await PrismaDB.instance.client.$connect();
  }

  static async disconnect() {
    await PrismaDB.instance.client.$disconnect();
  }

  static async ping() {
    await prisma.$queryRaw`SELECT 1`;
  }
}

new PrismaDB();

export const prisma: PrismaClient = PrismaDB.instance.client!;
