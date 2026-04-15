import Database from "better-sqlite3";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Single chunk with embedding vector and optional metadata. */
export type CachedChunk = {
  meta: Record<string, unknown> | null;
  vector: number[];
};

/**
 * SQLite-backed vector embedding cache.
 * SQLite 向量嵌入缓存，避免重复调用外部向量化 API。
 *
 * Each vectorizer model gets its own SQLite file under `cacheDir`.
 * Within that file, entries are keyed by (text, language_id).
 */
export class VectorCache {
  private readonly cacheDir: string;
  private readonly dbs = new Map<string, Database.Database>();

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
    mkdirSync(cacheDir, { recursive: true });
  }

  private getDb(modelName: string): Database.Database {
    let db = this.dbs.get(modelName);
    if (db) return db;

    const safeName = modelName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = join(this.cacheDir, `${safeName}.sqlite`);
    db = new Database(filePath);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        language_id TEXT NOT NULL,
        chunk_count INTEGER NOT NULL,
        dimension INTEGER NOT NULL,
        chunks_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (text, language_id)
      );
      CREATE INDEX IF NOT EXISTS idx_embeddings_lookup
        ON embeddings (text, language_id);
    `);
    this.dbs.set(modelName, db);
    return db;
  }

  get(
    modelName: string,
    text: string,
    languageId: string,
  ): CachedChunk[][] | undefined {
    const db = this.getDb(modelName);
    // oxlint-disable-next-line no-unsafe-type-assertion -- better-sqlite3 .get() returns unknown
    const row = db
      .prepare(
        "SELECT chunks_json FROM embeddings WHERE text = ? AND language_id = ?",
      )
      .get(text, languageId) as { chunks_json: string } | undefined;
    if (!row) return undefined;
    // oxlint-disable-next-line no-unsafe-type-assertion -- JSON.parse returns any
    return JSON.parse(row.chunks_json) as CachedChunk[][];
  }

  set(
    modelName: string,
    text: string,
    languageId: string,
    chunks: CachedChunk[][],
    dimension: number,
  ): void {
    const db = this.getDb(modelName);
    db.prepare(
      `INSERT OR REPLACE INTO embeddings (text, language_id, chunk_count, dimension, chunks_json)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(text, languageId, chunks.length, dimension, JSON.stringify(chunks));
  }

  /** Delete a model's entire cache file (dimension mismatch recovery). */
  invalidateModel(modelName: string): void {
    const db = this.dbs.get(modelName);
    if (db) {
      db.close();
      this.dbs.delete(modelName);
    }
    const safeName = modelName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = join(this.cacheDir, `${safeName}.sqlite`);
    if (existsSync(filePath)) rmSync(filePath);
  }

  /** Delete all cache files. */
  clearAll(): void {
    for (const [, db] of this.dbs) db.close();
    this.dbs.clear();
    if (existsSync(this.cacheDir)) rmSync(this.cacheDir, { recursive: true });
    mkdirSync(this.cacheDir, { recursive: true });
  }

  close(): void {
    for (const [, db] of this.dbs) db.close();
    this.dbs.clear();
  }
}
