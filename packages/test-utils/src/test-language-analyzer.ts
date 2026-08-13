import {
  LanguageAnalyzer,
  type CatPlugin,
  type LanguageAnalysisContext,
} from "@cat/plugin-core";
import {
  type LanguageAnalysisResult,
  type NormalizedLanguageId,
  type ServiceImplementationReference,
  normalizeLanguageId,
  PluginManifestSchema,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";

const TOKEN_PATTERN = /\p{L}+|\p{N}+|[^\s]/gu;
type TestScope =
  | { scopeType: "GLOBAL"; scopeId: "" }
  | { scopeType: "PROJECT" | "USER"; scopeId: string };

const buildLanguageAnalysisResult = (
  text: string,
  languageId: NormalizedLanguageId,
  reference: ServiceImplementationReference,
): LanguageAnalysisResult => {
  const tokens = Array.from(text.matchAll(TOKEN_PATTERN), (match) => {
    const value = match[0];
    const start = match.index ?? 0;
    const isPunct = /^[^\p{L}\p{N}]+$/u.test(value);
    return {
      text: value,
      lemma: isPunct ? value : value.toLowerCase(),
      pos: isPunct ? "PUNCT" : /^\p{N}+$/u.test(value) ? "NUM" : "NOUN",
      start,
      end: start + value.length,
      isStop: false,
      isPunct,
    };
  });
  return {
    sentences: [{ text, tokens, start: 0, end: text.length }],
    tokens,
    attestation: {
      contract: "cat.language-analysis/v1",
      languageId,
      implementation: {
        reference,
        packageName: "Mock Plugin mock-language-analyzer",
        packageVersion: "0.0.1",
      },
      generation: {
        id: `sha256:${"b".repeat(64)}`,
        planDigest: "c".repeat(64),
        schemaVersion: "1",
        provisionerVersion: "1",
        serverProtocolVersion: "1",
        sitePackagesDigest: "d".repeat(64),
        pythonAbi: "test-abi",
        pythonImplementation: "test-python",
        pythonVersion: "0.0.0",
        platform: "test-platform",
        spacyVersion: "0.0.0-test",
      },
      semanticConfig: { tokenizer: "unicode-word-pattern/v1" },
      engine: { name: "test-analyzer", version: "1" },
      pipeline: { id: "unicode-word-pattern", version: "1" },
      model: { id: "test-model", version: "1" },
      assets: [{ id: "test-model", version: "1", sha256: "0".repeat(64) }],
    },
  };
};

export class TestLanguageAnalyzer extends LanguageAnalyzer {
  private readonly reference: ServiceImplementationReference;

  constructor(scope: TestScope) {
    super();
    this.reference = ServiceImplementationReferenceSchema.parse({
      pluginId: "mock-language-analyzer",
      serviceId: "test-language-analyzer",
      serviceType: "LANGUAGE_ANALYZER",
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
    });
  }

  override getId = (): string => "test-language-analyzer";

  override getLanguageAnalysisConfigurationAssessment = () => ({
    status: "VALID" as const,
    supportedLanguages: ["en", "zh-Hans", "ja", "ko"].map(normalizeLanguageId),
    semanticConfiguration: { tokenizer: "unicode-word-pattern/v1" },
  });

  override analyze = async (
    context: LanguageAnalysisContext,
  ): Promise<LanguageAnalysisResult> =>
    buildLanguageAnalysisResult(
      context.text,
      context.languageId,
      this.reference,
    );
}

export const testLanguageAnalyzerManifest = PluginManifestSchema.parse({
  id: "mock-language-analyzer",
  version: "0.0.1",
  entry: "index.js",
  services: [
    { id: "test-language-analyzer", type: "LANGUAGE_ANALYZER", dynamic: false },
  ],
});

export const testLanguageAnalyzerPlugin = {
  services: async (ctx) => {
    if (ctx.scopeType === "GLOBAL") {
      return [new TestLanguageAnalyzer({ scopeType: "GLOBAL", scopeId: "" })];
    }
    if (ctx.scopeType === "PROJECT" || ctx.scopeType === "USER") {
      return [
        new TestLanguageAnalyzer({
          scopeType: ctx.scopeType,
          scopeId: ctx.scopeId,
        }),
      ];
    }
    throw new TypeError(`Unsupported test plugin scope: ${ctx.scopeType}`);
  },
} satisfies CatPlugin;
