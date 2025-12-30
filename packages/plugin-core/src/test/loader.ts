import { Readable } from "node:stream";
import type { CatPlugin } from "@/entities/plugin";
import type { PluginData, PluginManifest } from "@cat/shared/schema/plugin";
import type {
  MFAChallengeResult,
  MFAInitForUserContext,
  MFAInitForUserResult,
  MFAVerifyResult,
  VerifyChallengeContext,
} from "@/services/mfa-provider";
import type { AuthResult, PreAuthResult } from "@/services/auth-provider";
import type { QAIssue } from "@/services/qa";
import type { TranslatableElementDataWithoutLanguageId } from "@cat/shared/schema/misc";
import type {
  TermCandidate,
  RecognizedTermEntry,
  TermPairCandidate,
} from "@/services/term-services";
import type {
  UnvectorizedTextData,
  VectorizedTextData,
} from "@cat/shared/schema/misc";
import type { TranslationSuggestion } from "@cat/shared/schema/misc";
import type { Term } from "@cat/shared/schema/drizzle/glossary";
import { JSONType } from "@cat/shared/schema/json";
import { AuthProvider } from "@/services/auth-provider";
import { MFAProvider } from "@/services/mfa-provider";
import { StorageProvider } from "@/services/storage-provider";
import { TextVectorizer } from "@/services/text-vectorizer";
import { TranslatableFileHandler } from "@/services/translatable-file-handler";
import { TranslationAdvisor } from "@/services/translation-advisor";
import {
  TermExtractor,
  TermRecognizer,
  TermAligner,
} from "@/services/term-services";
import { QAChecker } from "@/services/qa";
import { VectorStorage } from "@/services/vector-storage";
import type { PluginLoader } from "@/registry/plugin-registry";

export class TestAuthProvider extends AuthProvider {
  public override getId = (): string => "auth-provider";
  public override getName = (): string => "Memory Auth";
  public override getIcon = (): string => "memory-icon-url";

  public override isAvailable = async (): Promise<boolean> => true;

  public override handleAuth = async (
    userId: string,
    identifier: string,
    _gotFromClient: { urlSearchParams: unknown; formData?: unknown },
    _preAuthMeta: JSONType,
  ): Promise<AuthResult> => {
    return {
      providerIssuer: "in-memory",
      providedAccountId: identifier,
      accountMeta: { verified: true },
    };
  };

  public override handlePreAuth = async (
    identifier: string,
  ): Promise<PreAuthResult> => {
    return {
      meta: { identifier },
      passToClient: { message: "Ready to auth" },
    };
  };
}

export class TestMFAProvider extends MFAProvider {
  public override getId = (): string => "mfa-provider";

  public override verifyChallenge = async (
    _ctx: VerifyChallengeContext,
  ): Promise<MFAVerifyResult> => {
    return { isSuccess: true };
  };

  public override generateChallenge = async (): Promise<MFAChallengeResult> => {
    return {
      meta: { code: "123456" },
      passToClient: { type: "code" },
    };
  };

  public override initForUser = async (
    _ctx: MFAInitForUserContext,
  ): Promise<MFAInitForUserResult> => {
    return { isSuccess: true, payload: { secret: "dummy-secret" } };
  };
}

export class TestStorageProvider extends StorageProvider {
  private storage = new Map<string, Buffer>();

  public override getId = (): string => "storage-provider";

  public override putStream = async (
    key: string,
    stream: Readable,
  ): Promise<void> => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      // oxlint-disable-next-line no-unsafe-argument
      chunks.push(Buffer.from(chunk));
    }
    this.storage.set(key, Buffer.concat(chunks));
  };

  public override getStream = async (key: string): Promise<Readable> => {
    const data = this.storage.get(key);
    if (!data) throw new Error(`File ${key} not found`);
    return Readable.from(data);
  };

  public override getPresignedPutUrl = async (key: string): Promise<string> => {
    return `memory://${key}`;
  };

  public override getPresignedGetUrl = async (key: string): Promise<string> => {
    return `memory://${key}`;
  };

  public override head = async (key: string): Promise<void> => {
    if (!this.storage.has(key)) throw new Error("Not found");
  };

  public override delete = async (key: string): Promise<void> => {
    this.storage.delete(key);
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

  public override canVectorize = (_languageId: string): boolean => true;

  public override vectorize = async (
    elements: UnvectorizedTextData[],
  ): Promise<VectorizedTextData[]> => {
    return elements.map(
      () =>
        [
          {
            meta: {},
            vector: Array.from({ length: 1024 }, () => Math.random()),
          },
        ] satisfies VectorizedTextData,
    );
  };
}

export class TestVectorStorage extends VectorStorage {
  private vectors = new Map<number, number[]>();

  public override getId = (): string => "vector-storage";

  public override store = async (
    chunks: { vector: number[]; chunkId: number }[],
  ): Promise<void> => {
    chunks.forEach((c) => this.vectors.set(c.chunkId, c.vector));
  };

  public override retrieve = async (
    chunkIds: number[],
  ): Promise<{ vector: number[]; chunkId: number }[]> => {
    return chunkIds
      .filter((id) => this.vectors.has(id))
      .map((id) => ({ chunkId: id, vector: this.vectors.get(id)! }));
  };

  public override cosineSimilarity = async (
    _vectors: number[][],
    chunkIdRange: number[],
    _minSimilarity: number,
    _maxAmount: number,
  ): Promise<{ chunkId: number; similarity: number }[]> => {
    return chunkIdRange
      .slice(0, 5)
      .map((id) => ({ chunkId: id, similarity: 1.0 }));
  };
}

export class TestTranslatableFileHandler extends TranslatableFileHandler {
  public override getId = (): string => "translatable-file-handler";

  public override canExtractElement = (_name: string): boolean => true;

  public override extractElement = async (
    fileContent: Buffer,
  ): Promise<TranslatableElementDataWithoutLanguageId[]> => {
    const text = fileContent.toString("utf-8");

    return text.split(/\r?\n/).map((line) => ({
      value: line,
      meta: {},
    }));
  };

  public override canGetReplacedFileContent = (_name: string): boolean => true;

  public override getReplacedFileContent = async (
    _fileContent: Buffer,
    elements: { meta: JSONType; value: string }[],
  ): Promise<Buffer> => {
    // 简单地将所有翻译片段连接起来作为新文件
    return Buffer.from(elements.map((e) => e.value).join("\n"));
  };
}

export class TestTranslationAdvisor extends TranslationAdvisor {
  public override getId = (): string => "translation-advisor";
  public override getName = (): string => "Mock Advisor";

  public override canSuggest = (_from: string, _to: string): boolean => true;

  public override getSuggestions = async (
    value: string,
  ): Promise<TranslationSuggestion[]> => {
    return [
      {
        from: value,
        value: `[Mock Translation] ${value}`,
        status: "SUCCESS",
      },
    ];
  };
}

export class TestTermExtractor extends TermExtractor {
  public override getId = (): string => "term-extractor";

  public override extract = async (
    text: string,
    _languageId: string,
  ): Promise<TermCandidate[]> => {
    // 假设所有用方括号括起来的都是术语，例如 [Term]
    const regex = /\[(.*?)\]/g;
    const candidates: TermCandidate[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      candidates.push({
        text: match[1],
        normalizedText: match[1].toLowerCase(),
        range: [{ start: match.index, end: match.index + match[0].length }],
      });
    }
    return candidates;
  };
}

export class TestTermRecognizer extends TermRecognizer {
  public override getId = (): string => "term-recognizer";

  public override recognize = async (
    source: { text: string; candidates: TermCandidate[] },
    _languageId: string,
  ): Promise<RecognizedTermEntry[]> => {
    // 假设所有候选词都被识别，ID 为 1
    return source.candidates.map(() => ({
      termEntryId: 1,
      confidence: 1.0,
    }));
  };
}

export class TestTermAligner extends TermAligner {
  public override getId = (): string => "term-aligner";

  public override align = async (
    source: { text: string; candidates: TermCandidate[] },
    target: { text: string; candidates: TermCandidate[] },
  ): Promise<TermPairCandidate[]> => {
    // 简单地按顺序通过索引对齐
    const pairs: TermPairCandidate[] = [];
    const minLen = Math.min(source.candidates.length, target.candidates.length);
    for (let i = 0; i < minLen; i += 1) {
      pairs.push({
        source: source.candidates[i],
        target: target.candidates[i],
        alignmentScore: 1.0,
      });
    }
    return pairs;
  };
}

export class TestQAChecker extends QAChecker {
  public override getId = (): string => "qa-checker";

  public override check = async (
    source: { text: string; languageId: string; terms?: Term[] },
    target: { text: string; languageId: string; terms?: Term[] },
  ): Promise<QAIssue[]> => {
    // 如果目标文本包含 "error"，则报错
    if (target.text.includes("error")) {
      return [
        {
          type: "incorrect",
          message: "Translation contains forbidden word 'error'",
        },
      ];
    }
    return [];
  };
}

type RegisteredPlugin = {
  manifest: PluginManifest;
  data: PluginData;
  instance: CatPlugin;
};

const plugin = {
  services: () => {
    return [
      new TestAuthProvider(),
      new TestMFAProvider(),
      new TestQAChecker(),
      new TestStorageProvider(),
      new TestTermAligner(),
      new TestTermExtractor(),
      new TestTermRecognizer(),
      new TestTextVectorizer(),
      new TestTranslatableFileHandler(),
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
      id: "auth-provider",
      type: "AUTH_PROVIDER",
    },
    {
      id: "mfa-provider",
      type: "MFA_PROVIDER",
    },
    {
      id: "qa-checker",
      type: "QA_CHECKER",
    },
    {
      id: "storage-provider",
      type: "STORAGE_PROVIDER",
    },
    {
      id: "term-aligner",
      type: "TERM_ALIGNER",
    },
    {
      id: "term-extractor",
      type: "TERM_EXTRACTOR",
    },
    {
      id: "term-recognizer",
      type: "TERM_RECOGNIZER",
    },
    {
      id: "translatable-file-handler",
      type: "TRANSLATABLE_FILE_HANDLER",
    },
    {
      id: "translation-advisor",
      type: "TRANSLATION_ADVISOR",
    },
    {
      id: "vector-storage",
      type: "VECTOR_STORAGE",
    },
    {
      id: "text-vectorizer",
      type: "TEXT_VECTORIZER",
    },
  ],
} satisfies PluginManifest;

/**
 * 默认包含一个 id 为 mock，实现所有服务的插件
 */
export class TestPluginLoader implements PluginLoader {
  private plugins = new Map<string, RegisteredPlugin>();

  constructor() {
    this.registerPlugin(manifest, plugin);
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

  public listAvailablePlugins = async (): Promise<string[]> => {
    return Array.from(this.plugins.keys());
  };
}
