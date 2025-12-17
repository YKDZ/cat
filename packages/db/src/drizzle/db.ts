import { join } from "node:path";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import * as schema from "./schema/schema.ts";
import * as relations from "./schema/relations.ts";

type DrizzleSchema = typeof schema & typeof relations;

const combinedSchema: DrizzleSchema = {
  ...schema,
  ...relations,
};

export class DrizzleDB {
  public client: NodePgDatabase<DrizzleSchema> & { $client: Client };

  constructor() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    this.client = drizzle({
      client,
      schema: combinedSchema,
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
}

export type DrizzleClient = DrizzleDB["client"];
export type OverallDrizzleClient = Omit<DrizzleClient, "$client">;
