import { join } from "node:path";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import * as document from "./schema/document.ts";
import * as file from "./schema/file.ts";
import * as glossary from "./schema/glossary.ts";
import * as memory from "./schema/memory.ts";
import * as misc from "./schema/misc.ts";
import * as plugin from "./schema/plugin.ts";
import * as project from "./schema/project.ts";
import * as translation from "./schema/translation.ts";
import * as user from "./schema/user.ts";
import * as vector from "./schema/vector.ts";
import { init } from "@/utils/init.ts";

type DrizzleSchema = typeof document &
  typeof file &
  typeof glossary &
  typeof memory &
  typeof misc &
  typeof plugin &
  typeof project &
  typeof translation &
  typeof user &
  typeof vector;

const schema: DrizzleSchema = {
  ...document,
  ...file,
  ...glossary,
  ...memory,
  ...misc,
  ...plugin,
  ...project,
  ...translation,
  ...user,
  ...vector,
};

export class DrizzleDB {
  public client: NodePgDatabase<DrizzleSchema> & { $client: Client };

  constructor() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    this.client = drizzle({
      client,
      schema,
      casing: "snake_case",
    });
  }

  async connect(): Promise<void> {
    await this.client.$client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.$client.end();
  }

  async ping(): Promise<void> {
    await this.client.execute(sql`SELECT 1`);
  }

  async migrate(): Promise<void> {
    await migrate(this.client, {
      migrationsFolder: join(process.cwd(), "drizzle"),
    });
  }

  async init(): Promise<void> {
    await init();
  }
}

export type DrizzleClient = DrizzleDB["client"];
export type OverallDrizzleClient = Omit<DrizzleClient, "$client">;
