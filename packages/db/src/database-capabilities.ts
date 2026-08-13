import { RequiredVectorDimension } from "@cat/shared";

export type DatabaseCapabilityClient = {
  query(statement: string): Promise<unknown>;
};

const concurrentInstallationSqlStates = new Set(["23505", "42710"]);
const capabilityPreparation = [
  {
    retryConcurrentInstallation: true,
    statement: "CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public",
  },
  {
    retryConcurrentInstallation: false,
    statement: "ALTER EXTENSION vector SET SCHEMA public",
  },
  {
    retryConcurrentInstallation: true,
    statement: "CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public",
  },
  {
    retryConcurrentInstallation: false,
    statement: "ALTER EXTENSION pg_trgm SET SCHEMA public",
  },
] as const;
const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replaceAll('"', '""')}"`;

const readCurrentSchema = (result: unknown): string | undefined => {
  if (typeof result !== "object" || result === null) return undefined;
  const rows = Reflect.get(result, "rows");
  if (!Array.isArray(rows)) return undefined;
  const firstRow = rows[0];
  if (typeof firstRow !== "object" || firstRow === null) return undefined;
  const schemaName = Reflect.get(firstRow, "schema_name");
  return typeof schemaName === "string" && schemaName !== ""
    ? schemaName
    : undefined;
};

const vectorRuntimeSchemaStatements = (schemaName: string) => {
  const schema = quoteIdentifier(schemaName);
  return [
    `CREATE TABLE IF NOT EXISTS ${schema}."Vector" (
    "id" serial PRIMARY KEY,
    "vector" public.vector(${RequiredVectorDimension}) NOT NULL,
    "chunk_id" integer NOT NULL REFERENCES ${schema}."Chunk"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
    `CREATE INDEX IF NOT EXISTS "embeddingIndex" ON ${schema}."Vector" USING hnsw ("vector" public.vector_cosine_ops)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Vector_chunkId_unique" ON ${schema}."Vector" ("chunk_id")`,
  ] as const;
};

const sqlState = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const code = Reflect.get(error, "code");
  return typeof code === "string" ? code : undefined;
};

/** Install the PostgreSQL extensions required before CAT schema operations. */
export const prepareDatabaseCapabilities = async (
  client: DatabaseCapabilityClient,
): Promise<void> => {
  for (const step of capabilityPreparation) {
    try {
      await client.query(step.statement);
    } catch (error) {
      if (
        !step.retryConcurrentInstallation ||
        !concurrentInstallationSqlStates.has(sqlState(error) ?? "")
      ) {
        throw error;
      }
      await client.query(step.statement);
    }
  }
};

/** Prepare the fixed vector schema in the client's current search path. */
export const prepareVectorRuntimeSchema = async (
  client: DatabaseCapabilityClient,
): Promise<void> => {
  const schemaName = readCurrentSchema(
    await client.query("SELECT current_schema() AS schema_name"),
  );
  if (schemaName === undefined) {
    throw new Error(
      "Vector runtime schema preparation failed because the current database schema is unavailable",
    );
  }
  for (const statement of vectorRuntimeSchemaStatements(schemaName)) {
    await client.query(statement);
  }
};
