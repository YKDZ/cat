import {
  DatabaseRequirementAssessmentSchema,
  type DatabaseRequirement,
  type DatabaseRequirementAssessment,
  type DatabaseRequirementBlockedReason,
  type DatabaseRequirementId,
  type DatabaseRequirementUnknownReason,
} from "@cat/shared";

export type DatabaseRequirementQueryOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type DatabaseRequirementDb = {
  execute: (
    statement: string,
    options?: DatabaseRequirementQueryOptions,
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type { DatabaseRequirement, DatabaseRequirementAssessment };

const DATABASE_REQUIREMENT_QUERY_TIMEOUT_MS = 1_000;

const blocked = (
  id: DatabaseRequirementId,
  reason: DatabaseRequirementBlockedReason,
): DatabaseRequirement => ({ blocker: { reason }, id, status: "BLOCKED" });

const satisfied = (id: DatabaseRequirementId): DatabaseRequirement => ({
  id,
  status: "SATISFIED",
});

const unknown = (
  id: DatabaseRequirementId,
  reason: DatabaseRequirementUnknownReason = "PROBE_UNCLASSIFIED",
): DatabaseRequirement => ({ blocker: { reason }, id, status: "UNKNOWN" });

const sqlState = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const code = Reflect.get(error, "code");
  return typeof code === "string" ? code : undefined;
};

const unknownReason = (error: unknown): DatabaseRequirementUnknownReason => {
  const code = sqlState(error);
  if (code === "42501") return "PERMISSION_DENIED";
  if (code === "57014") return "QUERY_TIMEOUT";
  if (code?.startsWith("08") === true) return "CONNECTION_UNAVAILABLE";
  if (
    error instanceof Error &&
    /abort|timeout|cancel/i.test(`${error.name} ${error.message}`)
  ) {
    return "QUERY_TIMEOUT";
  }
  return "PROBE_UNCLASSIFIED";
};

const requirementFromProbeError = (
  id: DatabaseRequirementId,
  error: unknown,
): DatabaseRequirement => {
  const code = sqlState(error);
  return code === "42883" || code === "42704" || code === "3F000"
    ? blocked(id, "MISSING_CAPABILITY")
    : unknown(id, unknownReason(error));
};

const execute = async (
  db: DatabaseRequirementDb,
  statement: string,
  signal: AbortSignal | undefined,
): Promise<{ rows: Record<string, unknown>[] }> => {
  signal?.throwIfAborted();
  const result = await db.execute(statement, {
    timeoutMs: DATABASE_REQUIREMENT_QUERY_TIMEOUT_MS,
    ...(signal === undefined ? {} : { signal }),
  });
  signal?.throwIfAborted();
  return result;
};

const assessTrigram = async (
  db: DatabaseRequirementDb,
  installed: Set<string>,
  signal: AbortSignal | undefined,
): Promise<DatabaseRequirement> => {
  if (!installed.has("pg_trgm")) {
    return blocked("POSTGRESQL_TRIGRAM_MATCHING", "EXTENSION_MISSING");
  }
  try {
    const result = await execute(
      db,
      `SELECT
        similarity('cat', 'cat') AS score,
        'cat' % 'cat' AS has_similarity_operator,
        EXISTS (
          SELECT 1
          FROM pg_operator operator
          JOIN pg_amop operator_family_member
            ON operator_family_member.amopopr = operator.oid
          JOIN pg_opfamily operator_family
            ON operator_family.oid = operator_family_member.amopfamily
          JOIN pg_opclass operator_class
            ON operator_class.opcfamily = operator_family.oid
          JOIN pg_am method ON method.oid = operator_class.opcmethod
          JOIN pg_extension extension ON extension.extname = 'pg_trgm'
          JOIN pg_depend operator_dependency
            ON operator_dependency.classid = 'pg_operator'::regclass
            AND operator_dependency.objid = operator.oid
            AND operator_dependency.refclassid = 'pg_extension'::regclass
            AND operator_dependency.refobjid = extension.oid
          JOIN pg_depend family_dependency
            ON family_dependency.classid = 'pg_opfamily'::regclass
            AND family_dependency.objid = operator_family.oid
            AND family_dependency.refclassid = 'pg_extension'::regclass
            AND family_dependency.refobjid = extension.oid
          JOIN pg_depend class_dependency
            ON class_dependency.classid = 'pg_opclass'::regclass
            AND class_dependency.objid = operator_class.oid
            AND class_dependency.refclassid = 'pg_extension'::regclass
            AND class_dependency.refobjid = extension.oid
          WHERE operator.oprname = '%'
            AND method.amname = 'gin'
            AND operator_class.opcname = 'gin_trgm_ops'
        ) AS has_trigram_operator_family`,
      signal,
    );
    const behaviour = result.rows.at(0);
    return Number(behaviour?.score) === 1 &&
      behaviour?.has_similarity_operator === true &&
      behaviour?.has_trigram_operator_family === true
      ? satisfied("POSTGRESQL_TRIGRAM_MATCHING")
      : blocked("POSTGRESQL_TRIGRAM_MATCHING", "REQUIRED_BEHAVIOUR_MISSING");
  } catch (error) {
    return requirementFromProbeError("POSTGRESQL_TRIGRAM_MATCHING", error);
  }
};

const assessVector = async (
  db: DatabaseRequirementDb,
  installed: Set<string>,
  signal: AbortSignal | undefined,
): Promise<DatabaseRequirement> => {
  if (!installed.has("vector")) {
    return blocked("POSTGRESQL_VECTOR_STORAGE", "EXTENSION_MISSING");
  }
  try {
    const result = await execute(
      db,
      `SELECT
        a.atttypmod AS dimension,
        a.attnotnull AS is_not_null,
        chunk_attribute.attnotnull AS has_not_null_chunk,
        (
          array_fill(1::real, ARRAY[1024])::vector(1024)
          <=> array_fill(1::real, ARRAY[1024])::vector(1024)
        ) = 0 AS has_cosine_behaviour,
        EXISTS (
          SELECT 1
          FROM pg_constraint foreign_key
          WHERE foreign_key.conrelid = c.oid
            AND foreign_key.contype = 'f'
            AND foreign_key.confrelid = chunk_table.oid
            AND foreign_key.conkey::smallint[] = ARRAY[chunk_attribute.attnum]::smallint[]
            AND foreign_key.confkey::smallint[] = ARRAY[chunk_id_attribute.attnum]::smallint[]
            AND foreign_key.confdeltype = 'c'
            AND foreign_key.confupdtype = 'c'
        ) AS has_chunk_foreign_key,
        EXISTS (
          SELECT 1
          FROM pg_index idx
          JOIN pg_class index_relation ON index_relation.oid = idx.indexrelid
          JOIN pg_am method ON method.oid = index_relation.relam
          JOIN pg_opclass operator_class ON operator_class.oid = idx.indclass[0]
          WHERE idx.indrelid = c.oid
            AND idx.indisvalid
            AND idx.indisready
            AND idx.indpred IS NULL
            AND idx.indnatts = 1
            AND idx.indnkeyatts = 1
            AND idx.indkey[0] = a.attnum
            AND method.amname = 'hnsw'
            AND operator_class.opcname = 'vector_cosine_ops'
        ) AS has_hnsw_index,
        EXISTS (
          SELECT 1
          FROM pg_index idx
          WHERE idx.indrelid = c.oid
            AND idx.indisunique
            AND idx.indisvalid
            AND idx.indisready
            AND idx.indpred IS NULL
            AND idx.indnatts = 1
            AND idx.indnkeyatts = 1
            AND idx.indkey[0] = chunk_attribute.attnum
        ) AS has_unique_chunk_index
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_attribute chunk_attribute
        ON chunk_attribute.attrelid = c.oid
        AND chunk_attribute.attname = 'chunk_id'
        AND chunk_attribute.attnum > 0
      JOIN pg_class chunk_table ON chunk_table.oid = to_regclass('"Chunk"')
      JOIN pg_attribute chunk_id_attribute
        ON chunk_id_attribute.attrelid = chunk_table.oid
        AND chunk_id_attribute.attname = 'id'
        AND chunk_id_attribute.attnum > 0
      WHERE c.oid = to_regclass('"Vector"')
        AND a.attname = 'vector'
        AND a.attnum > 0`,
      signal,
    );
    const schema = result.rows.at(0);
    if (
      schema === undefined ||
      schema.dimension !== 1024 ||
      schema.has_hnsw_index !== true ||
      schema.has_chunk_foreign_key !== true ||
      schema.has_unique_chunk_index !== true ||
      schema.has_not_null_chunk !== true ||
      schema.is_not_null !== true
    ) {
      return blocked("POSTGRESQL_VECTOR_STORAGE", "REQUIRED_SCHEMA_INVALID");
    }
    if (schema.has_cosine_behaviour !== true) {
      return blocked("POSTGRESQL_VECTOR_STORAGE", "REQUIRED_BEHAVIOUR_MISSING");
    }
    return satisfied("POSTGRESQL_VECTOR_STORAGE");
  } catch (error) {
    return requirementFromProbeError("POSTGRESQL_VECTOR_STORAGE", error);
  }
};

/** Assess required PostgreSQL behaviour using only catalog and SELECT probes. */
export const assessDatabaseRequirements = async (
  db: DatabaseRequirementDb,
  options: { signal?: AbortSignal } = {},
): Promise<DatabaseRequirementAssessment> => {
  const { signal } = options;
  try {
    await execute(db, "SELECT version()", signal);
  } catch (error) {
    const core = requirementFromProbeError("POSTGRESQL_CORE", error);
    return DatabaseRequirementAssessmentSchema.parse({
      requirements: [
        core,
        unknown("POSTGRESQL_TRIGRAM_MATCHING", unknownReason(error)),
        unknown("POSTGRESQL_VECTOR_STORAGE", unknownReason(error)),
      ],
    });
  }

  let installed: Set<string>;
  try {
    const result = await execute(
      db,
      `SELECT extname, extversion
      FROM pg_extension
      WHERE extname IN ('vector', 'pg_trgm')`,
      signal,
    );
    installed = new Set(
      result.rows.flatMap((row) =>
        typeof row.extname === "string" ? [row.extname] : [],
      ),
    );
  } catch (error) {
    return DatabaseRequirementAssessmentSchema.parse({
      requirements: [
        satisfied("POSTGRESQL_CORE"),
        unknown("POSTGRESQL_TRIGRAM_MATCHING", unknownReason(error)),
        unknown("POSTGRESQL_VECTOR_STORAGE", unknownReason(error)),
      ],
    });
  }

  return DatabaseRequirementAssessmentSchema.parse({
    requirements: [
      satisfied("POSTGRESQL_CORE"),
      await assessTrigram(db, installed, signal),
      await assessVector(db, installed, signal),
    ],
  });
};

export const assertDatabaseRequirements = async (
  db: DatabaseRequirementDb,
): Promise<DatabaseRequirementAssessment> => {
  const assessment = DatabaseRequirementAssessmentSchema.parse(
    await assessDatabaseRequirements(db),
  );
  const unsatisfied = assessment.requirements.filter(
    ({ status }) => status !== "SATISFIED",
  );
  if (unsatisfied.length > 0) {
    throw new Error(
      `Database requirements are not satisfied: ${unsatisfied
        .map(({ id, status }) => `${id}=${status}`)
        .join(", ")}`,
    );
  }
  return assessment;
};
