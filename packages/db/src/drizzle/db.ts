import type { MigratorInitFailResponse } from "drizzle-orm/migrator";

import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { relations } from "@/drizzle/schema.ts";

export class DrizzleDB {
  public client: NodePgDatabase<typeof relations> & { $client: Pool };

  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    this.client = drizzle({
      client: pool,
      relations,
    });
  }

  async connect(): Promise<void> {
    // Pool manages connections lazily; execute a ping to verify connectivity
    await this.client.execute(sql`SELECT 1`);
  }

  async disconnect(): Promise<void> {
    await this.client.$client.end();
  }

  async ping(): Promise<void> {
    await this.client.execute(sql`SELECT 1`);
  }

  async migrate(
    migrationsFolder: string,
  ): Promise<void | MigratorInitFailResponse> {
    return await migrate(this.client, {
      migrationsFolder,
    });
  }
}

export type DrizzleClient = Omit<DrizzleDB["client"], "$client">;
export type DrizzleTransaction = Parameters<
  Parameters<DrizzleClient["transaction"]>[0]
>[0];
