import type { VectorizedTextData } from "@cat/shared";
import type { PluginData, PluginManifest } from "@cat/shared";
import type { TranslationAdvise } from "@cat/shared";

import { and, cosineDistance, desc, gt, inArray, sql } from "@cat/db";
import { chunk } from "@cat/db";
import { getDbHandle } from "@cat/domain";
import {
  CatPlugin,
  VectorStorage,
  type CosineSimilarityContext,
  type RetrieveContext,
  type StoreContext,
  TranslationAdvisor,
  type GetSuggestionsContext,
  TextVectorizer,
  type CanVectorizeContext,
  type VectorizeContext,
  StorageProvider,
  type DeleteContext,
  type GetPresignedGetUrlContext,
  type GetPresignedPutUrlContext,
  type GetRangeContext,
  type GetStreamContext,
  type HeadContext,
  type PutStreamContext,
  type PluginLoader,
  FileImporter,
  type CanExportContext,
  type ExportContext,
  FileExporter,
  type ImportContext,
  type ElementData,
  type CanImportContext,
  type UpdateDimensionContext,
  type InitContext,
} from "@cat/plugin-core";
import {
  pgTable,
  serial,
  integer,
  vector as dbVector,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { Readable } from "node:stream";

import {
  testNlpSegmenterManifest,
  testNlpSegmenterPlugin,
} from "./test-nlp-segmenter.ts";

const vector = pgTable(
  "Vector",
  {
    id: serial().primaryKey(),
    vector: dbVector({ dimensions: 1024 }).notNull(),
    chunkId: integer()
      .notNull()
      .references(() => chunk.id, { onDelete: "cascade", onUpdate: "cascade" }),
  },
  (table) => [
    index("embeddingIndex").using("hnsw", table.vector.op("vector_cosine_ops")),
    unique().on(table.chunkId),
  ],
);

export class TestStorageProvider extends StorageProvider {
  private storage = new Map<string, Buffer>();

  public override getId = (): string => "storage-provider";

  public override putStream = async ({
    key,
    stream,
  }: PutStreamContext): Promise<void> => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      // oxlint-disable-next-line no-unsafe-argument
      chunks.push(Buffer.from(chunk));
    }
    this.storage.set(key, Buffer.concat(chunks));
  };

  public override getStream = async ({
    key,
  }: GetStreamContext): Promise<Readable> => {
    const data = this.storage.get(key);
    if (!data) throw new Error(`File ${key} not found`);
    return Readable.from(data);
  };

  public override getPresignedPutUrl = async ({
    key,
  }: GetPresignedPutUrlContext): Promise<string> => {
    return `memory://${key}`;
  };

  public override getPresignedGetUrl = async ({
    key,
  }: GetPresignedGetUrlContext): Promise<string> => {
    return `memory://${key}`;
  };

  public override head = async ({ key }: HeadContext): Promise<void> => {
    if (!this.storage.has(key)) throw new Error("Not found");
  };

  public override delete = async ({ key }: DeleteContext): Promise<void> => {
    this.storage.delete(key);
  };

  public override getRange = async ({
    key,
    start,
    end,
  }: GetRangeContext): Promise<{
    data: string;
    total: number;
    actualEnd: number;
  }> => {
    const data = this.storage.get(key);
    if (!data) throw new Error(`File ${key} not found`);

    const total = data.length;
    const actualStart = Math.max(0, start);
    const actualEnd = Math.min(total - 1, end);

    if (actualStart > actualEnd) {
      return { data: "", total, actualEnd: actualStart - 1 };
    }

    const slice = data.subarray(actualStart, actualEnd + 1);

    // 处理 UTF-8 边界：如果最后一个字节是不完整的 UTF-8 字符，去掉它
    let sliceEnd = slice.length;
    while (sliceEnd > 0) {
      const lastByte = slice[sliceEnd - 1];
      // UTF-8 continuation bytes: 10xxxxxx (128-191)
      if (lastByte >= 128 && lastByte < 192) {
        sliceEnd -= 1;
      } else {
        break;
      }
    }

    const dataStr = slice.subarray(0, sliceEnd).toString("utf-8");
    // 返回实际读取的字节位置（包括被截断的无效 UTF-8 字节）
    // 这样客户端下次会从正确的位置继续，不会跳过任何内容
    return { data: dataStr, total, actualEnd: actualStart + slice.length - 1 };
  };

  // oxlint-disable-next-line no-empty-function
  public override ping = async (): Promise<void> => {};

  // oxlint-disable-next-line no-empty-function
  public override connect = async (): Promise<void> => {};

  // oxlint-disable-next-line no-empty-function
  public override disconnect = async (): Promise<void> => {};
}

export class TestTextVectorizer extends TextVectorizer {
  public override getId = (): string => "text-vectorizer";

  public override canVectorize = (_ctx: CanVectorizeContext): boolean => true;

  public override vectorize = async ({
    elements,
  }: VectorizeContext): Promise<VectorizedTextData[]> => {
    return elements.map((element) => {
      // 1. 初始化 1024 维零向量
      const vector = Array.from({ length: 1024 }, () => 0);
      const text = element.text || ""; // 假设 element 有 content 字段

      // 2. 简单的分词 (按空格和标点分割)
      const tokens = text.toLowerCase().split(/[\s,.!?;]+/);

      // 3. Feature Hashing: 将每个词映射到 0-1023 的下标并累加
      tokens.forEach((token) => {
        if (!token) return;
        const hash = this.simpleHash(token);
        const index = Math.abs(hash) % 1024;
        vector[index] += 1;
      });

      // 4. (可选) L2 归一化，这对计算余弦相似度很重要
      this.normalize(vector);

      return [
        {
          meta: {},
          vector: vector,
        },
      ] satisfies VectorizedTextData;
    });
  };

  /**
   * 简单的字符串哈希函数 (DJB2 算法变体)
   */
  private simpleHash = (str: string): number => {
    let hash = 5381;
    for (let i = 0; i < str.length; i += 1) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return hash >>> 0; // 保证非负
  };

  /**
   * 向量归一化 (L2 Norm)
   */
  private normalize = (vector: number[]): void => {
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0),
    );
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i += 1) {
        vector[i] /= magnitude;
      }
    }
  };
}

export class TestVectorStorage extends VectorStorage {
  public override getId = (): string => "vector-storage";

  async store({ chunks }: StoreContext): Promise<void> {
    const { client: drizzle } = await getDbHandle();
    if (chunks.length === 0) return;

    await drizzle.insert(vector).values(
      chunks.map((c) => ({
        chunkId: c.chunkId,
        vector: c.vector,
      })),
    );
  }

  async retrieve({
    chunkIds,
  }: RetrieveContext): Promise<{ vector: number[]; chunkId: number }[]> {
    const { client: drizzle } = await getDbHandle();
    const results = await drizzle
      .select({ vector: vector.vector, chunkId: vector.chunkId })
      .from(vector)
      .where(inArray(vector.chunkId, chunkIds));
    return results;
  }

  async cosineSimilarity({
    vectors,
    chunkIdRange,
    minSimilarity,
    maxAmount,
  }: CosineSimilarityContext): Promise<
    { chunkId: number; similarity: number }[]
  > {
    if (chunkIdRange.length === 0) {
      return [];
    }

    const { client: drizzle } = await getDbHandle();
    const allResults = await Promise.all(
      vectors.map(async (queryVec) => {
        const distance = cosineDistance(vector.vector, queryVec);
        const similarity = sql<number>`1 - (${distance})`;
        return drizzle
          .select({
            chunkId: vector.chunkId,
            similarity: similarity,
          })
          .from(vector)
          .where(
            and(
              inArray(vector.chunkId, chunkIdRange),
              gt(similarity, minSimilarity),
            ),
          )
          .orderBy(desc(similarity))
          .limit(maxAmount);
      }),
    );
    const results = allResults.flat();

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxAmount);
  }

  override async updateDimension(ctx: UpdateDimensionContext): Promise<void> {
    return;
  }

  override async init(ctx: InitContext): Promise<void> {
    return;
  }
}

export class TestFileImporter extends FileImporter {
  public override getId = (): string => "file-importer";

  public override canImport = (_ctx: CanImportContext): boolean => true;

  public override import = async ({
    fileContent,
  }: ImportContext): Promise<ElementData[]> => {
    const text = fileContent.toString("utf-8");

    return text.split(/\r?\n/).map((line) => ({
      text: line,
      meta: {},
    }));
  };
}

export class TestFileExporter extends FileExporter {
  public override getId = (): string => "file-exporter";

  public override canExport = (_ctx: CanExportContext): boolean => true;

  public override export = async ({
    elements,
  }: ExportContext): Promise<Buffer> => {
    return Buffer.from(elements.map((e) => e.text).join("\n"));
  };
}

export class TestTranslationAdvisor extends TranslationAdvisor {
  public override getId = (): string => "translation-advisor";
  public override getDisplayName = (): string => "Mock Advisor";

  public override advise = async ({
    source: { text },
  }: GetSuggestionsContext): Promise<TranslationAdvise[]> => {
    return [
      {
        translation: `[Mock Translation] ${text}`,
        confidence: 0.8,
      },
    ];
  };
}

type RegisteredPlugin = {
  manifest: PluginManifest;
  data: PluginData;
  instance: CatPlugin;
};

export type TestPluginLoaderOptions = {
  includeNlpSegmenter?: boolean;
};

const plugin = {
  services: () => {
    return [
      new TestStorageProvider(),
      new TestTextVectorizer(),
      new TestFileImporter(),
      new TestFileExporter(),
      new TestTranslationAdvisor(),
      new TestVectorStorage(),
    ];
  },
} satisfies CatPlugin;

const manifest = {
  id: "mock",
  version: "0.0.1",
  entry: "index.js",
  services: [
    {
      id: "qa-checker",
      type: "QA_CHECKER",
      dynamic: false,
    },
    {
      id: "storage-provider",
      type: "STORAGE_PROVIDER",
      dynamic: false,
    },
    {
      id: "file-importer",
      type: "FILE_IMPORTER",
      dynamic: false,
    },
    {
      id: "file-exporter",
      type: "FILE_EXPORTER",
      dynamic: false,
    },
    {
      id: "translation-advisor",
      type: "TRANSLATION_ADVISOR",
      dynamic: false,
    },
    {
      id: "vector-storage",
      type: "VECTOR_STORAGE",
      dynamic: false,
    },
    {
      id: "text-vectorizer",
      type: "TEXT_VECTORIZER",
      dynamic: false,
    },
  ],
} satisfies PluginManifest;

/**
 * 默认包含一个 id 为 mock，实现所有服务的插件
 */
export class TestPluginLoader implements PluginLoader {
  private plugins = new Map<string, RegisteredPlugin>();

  constructor(options: TestPluginLoaderOptions = {}) {
    this.registerPlugin(manifest, plugin);
    if (options.includeNlpSegmenter) {
      this.registerMockNlpSegmenter();
    }
  }

  public registerPlugin = (
    manifest: PluginManifest,
    instance: CatPlugin,
  ): void => {
    const name = `Mock Plugin ${manifest.id}`;

    const data: PluginData = {
      name,
      overview: "This is a mock plugin for testing.",
      ...manifest,
    };

    this.plugins.set(manifest.id, {
      manifest,
      data,
      instance,
    });
  };

  /**
   * Register a mock NLP_WORD_SEGMENTER service as a separate plugin.
   *
   * By default, `TestPluginLoader` does **not** include an NLP segmenter,
   * so that existing tests relying on the `intl-fallback` path are not
   * accidentally changed. Call this method explicitly to opt in.
   */
  public registerMockNlpSegmenter = (): void => {
    this.registerPlugin(testNlpSegmenterManifest, testNlpSegmenterPlugin);
  };

  public getManifest = async (pluginId: string): Promise<PluginManifest> => {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found in memory`);
    return plugin.manifest;
  };

  public getData = async (pluginId: string): Promise<PluginData> => {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found in memory`);
    return plugin.data;
  };

  public getInstance = async (pluginId: string): Promise<CatPlugin> => {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found in memory`);
    return plugin.instance;
  };

  public listAvailablePlugins = async (): Promise<PluginManifest[]> => {
    return [...this.plugins.values()].map((p) => p.manifest);
  };
}
