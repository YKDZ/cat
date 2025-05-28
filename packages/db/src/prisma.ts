import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma";

export class PrismaDB {
  public static instance: PrismaDB;
  public client: PrismaClient;

  constructor() {
    if (PrismaDB.instance)
      throw Error("PrismaDB can only have a single instance");

    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });
    // this.client = new PrismaClient({ adapter });
    this.client = new PrismaClient();
    PrismaDB.instance = this;
  }

  static async connect() {
    await PrismaDB.instance.client.$connect();
  }

  static async disconnect() {
    await PrismaDB.instance.client.$disconnect();
  }
}

new PrismaDB();

export const prisma: PrismaClient = PrismaDB.instance.client!;
