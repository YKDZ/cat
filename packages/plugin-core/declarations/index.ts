import type { Readable } from "node:stream";

import type { Hono } from "hono";
import type { ZodObject, ZodType } from "zod";

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type PluginServiceType =
  | "AGENT_CONTEXT_PROVIDER"
  | "AGENT_TOOL_PROVIDER"
  | "AUTH_FACTOR"
  | "EMAIL_PROVIDER"
  | "FILE_EXPORTER"
  | "FILE_IMPORTER"
  | "LLM_PROVIDER"
  | "NLP_WORD_SEGMENTER"
  | "QA_CHECKER"
  | "RERANK_PROVIDER"
  | "STORAGE_PROVIDER"
  | "TEXT_VECTORIZER"
  | "TOKENIZER"
  | "TRANSLATION_ADVISOR"
  | "VECTOR_STORAGE";

export type ScopeType = "GLOBAL" | "PROJECT";

export interface IPluginService {
  getId(): string;
  getType(): PluginServiceType;
}

export type PluginServiceAvailability = {
  available: boolean;
  reason:
    | "ok"
    | "missing-config"
    | "disabled-by-runtime"
    | "remote-unreachable";
  message?: string;
};

export interface PluginServiceAvailabilityProbe {
  getAvailability():
    | PluginServiceAvailability
    | Promise<PluginServiceAvailability>;
}

export declare class PluginServiceUnavailableError extends Error {
  readonly availability: PluginServiceAvailability;
  constructor(availability: PluginServiceAvailability);
}

export declare const hasAvailabilityProbe: (
  service: IPluginService,
) => service is IPluginService & PluginServiceAvailabilityProbe;

export type ComponentData = { name: string; slot: string; url: string };
export type ComponentRecord = ComponentData & { pluginId: string };
export declare const ComponentDataSchema: ZodType<ComponentData>;
export declare const ComponentRecordSchema: ZodType<ComponentRecord>;

export type CacheStore = {
  get(key: string): Promise<JsonValue | null>;
  set(key: string, value: JsonValue, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
};

export type SessionStore = {
  get(sessionId: string, key: string): Promise<JsonValue | null>;
  set(
    sessionId: string,
    key: string,
    value: JsonValue,
    ttlSeconds?: number,
  ): Promise<void>;
  delete(sessionId: string, key: string): Promise<void>;
};

export type PluginCapabilities = {
  auth: {
    getAccountMetaByProviderAndIdentifier(input: {
      providedAccountId: string;
      providerIssuer: string;
    }): Promise<unknown>;
    getMfaPayloadForUser(input: {
      factorId: string;
      userId: string;
    }): Promise<unknown>;
  };
  [capability: string]: unknown;
};

export type RegisteredService = {
  dbId: number;
  id: string;
  pluginId: string;
  service: IPluginService;
  type: PluginServiceType;
};

export type PluginAuthContext = {
  pluginId: string;
  scopeType: ScopeType;
  scopeId: string;
  checkPermission(
    objectType: string,
    relation: string,
    objectId: string,
  ): Promise<boolean>;
};

export type PluginContext = {
  config: JsonValue;
  scopeType: string;
  scopeId: string;
  registeredServices: Omit<RegisteredService, "pluginId" | "service">[];
  capabilities: PluginCapabilities;
  cacheStore: CacheStore;
  sessionStore: SessionStore;
  auth: PluginAuthContext;
};

export type RouteContext = PluginContext & { app: Hono; baseURL: string };

export interface CatPlugin {
  services?(ctx: PluginContext): IPluginService[] | Promise<IPluginService[]>;
  components?(ctx: PluginContext): ComponentData[] | Promise<ComponentData[]>;
  routes?(ctx: RouteContext): Promise<void> | void;
  onActivate?(ctx: PluginContext): Promise<void> | void;
  onDeactivate?(ctx: PluginContext): Promise<void> | void;
}

export type AuthFactorAAL = 1 | 2;
export type AuthFactorInput = Record<string, unknown>;
export type AuthFactorResult =
  | {
      status: "success";
      providedAccountId?: string;
      providerIssuer?: string;
      aal: AuthFactorAAL;
      data?: Record<string, unknown>;
    }
  | { status: "failure"; error: { code: string; message: string } };
export type AuthFactorExecutionContext = {
  identifier?: string;
  userId?: string;
  input: AuthFactorInput;
  httpContext: { ip: string; userAgent: string };
};
export declare abstract class AuthFactor implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType;
  abstract getName(): string;
  abstract getIcon(): string;
  abstract getClientComponentType(): string;
  abstract getAal(): AuthFactorAAL;
  abstract execute(ctx: AuthFactorExecutionContext): Promise<AuthFactorResult>;
  abstract isAvailable(): Promise<boolean>;
}

export type PutStreamContext = {
  key: string;
  stream: Readable;
  onProgress?(progress: {
    loaded?: number;
    total?: number;
    part?: number;
    percentage?: number;
  }): void;
};
export type GetStreamContext = { key: string };
export type GetRangeContext = { key: string; start: number; end: number };
export type GetPresignedPutUrlContext = { key: string; expiresIn: number };
export type GetPresignedGetUrlContext = {
  key: string;
  expiresIn: number;
  fileName?: string;
};
export type HeadContext = { key: string };
export type DeleteContext = { key: string };
export declare abstract class StorageProvider implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType;
  abstract putStream(ctx: PutStreamContext): Promise<void>;
  abstract getStream(ctx: GetStreamContext): Promise<Readable>;
  abstract getRange(
    ctx: GetRangeContext,
  ): Promise<{ data: string; total: number; actualEnd: number }>;
  abstract getPresignedPutUrl(ctx: GetPresignedPutUrlContext): Promise<string>;
  abstract getPresignedGetUrl(ctx: GetPresignedGetUrlContext): Promise<string>;
  abstract head(ctx: HeadContext): Promise<void>;
  abstract delete(ctx: DeleteContext): Promise<void>;
  abstract ping(): Promise<void>;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  shouldProxy(): boolean;
}

export type ElementData = {
  ref: string;
  stableSourceRef: string;
  sourceNodeRef?: string;
  text: string;
  meta?: unknown;
  localOrder?: number;
  location?: { startLine?: number; endLine?: number; custom?: unknown };
};
export type FileImportResult = {
  importerId: string;
  sourceRootRef: string;
  sourceNode: {
    ref: string;
    stableSourceNodeRef: string;
    displayLabel: string;
    sourcePath?: string;
    sourceType?: string;
  };
  relationTypes?: unknown[];
  elements: ElementData[];
  relations?: unknown[];
  evidence?: unknown[];
};
export type CanImportContext = { name: string };
export type CanExportContext = { name: string };
export type ImportContext = {
  fileContent: Buffer;
  name: string;
  fileId: number;
  contentNodeId?: string;
  sourceRootRef: string;
  sourceNodeRef: string;
  stableSourceNodeRef: string;
};
export type ExportContext = {
  fileContent: Buffer;
  elements: Array<{
    ref: string;
    stableSourceRef: string;
    meta: unknown;
    text: string;
    localOrder: number;
  }>;
};
export declare abstract class FileImporter implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType;
  abstract canImport(ctx: CanImportContext): boolean;
  abstract import(ctx: ImportContext): Promise<FileImportResult>;
}
export declare abstract class FileExporter implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType;
  abstract canExport(ctx: CanExportContext): boolean;
  abstract export(ctx: ExportContext): Promise<Buffer>;
}

export type JsonSchema = boolean | Record<string, unknown>;
export type ChatMessageRole = "system" | "user" | "assistant" | "tool";
export type ToolCall = { id: string; name: string; arguments: string };
export type ChatMessage = {
  role: ChatMessageRole;
  content: string | null;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  reasoningContent?: string;
};
export type ToolDefinition = {
  name: string;
  description: string;
  parameters: JsonSchema;
};
export type ChatCompletionRequest = {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  thinking?: boolean;
  signal?: AbortSignal;
};
export type ChatCompletionFinishReason =
  | "stop"
  | "tool_calls"
  | "length"
  | "error";
export type ChatCompletionUsage = {
  promptTokens: number;
  completionTokens: number;
};
export type LLMChunk =
  | { type: "text_delta"; textDelta: string }
  | { type: "thinking_delta"; thinkingDelta: string }
  | {
      type: "tool_call_delta";
      toolCallDelta: { id: string; name?: string; argumentsDelta?: string };
    }
  | { type: "usage"; usage: ChatCompletionUsage }
  | { type: "finish"; finishReason: ChatCompletionFinishReason }
  | { type: "error"; error: Error };
export declare abstract class LLMProvider implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType;
  abstract getModelName(): string;
  abstract chat(request: ChatCompletionRequest): AsyncIterable<LLMChunk>;
}

export type RerankProviderCall = {
  query: string;
  documents: Array<{ id: string; text: string }>;
  topN?: number;
  signal?: AbortSignal;
};
export type RerankResponse = {
  results: Array<{ id: string; index: number; relevanceScore: number }>;
};
export declare abstract class RerankProvider implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType;
  abstract getModelName(): string;
  abstract rerank(input: RerankProviderCall): Promise<RerankResponse>;
}

export type TokenType =
  | "text"
  | "term"
  | "variable"
  | "number"
  | "whitespace"
  | "punctuation"
  | "link"
  | "newline"
  | "mask";
export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  children?: Token[];
  meta?: Record<string, JsonValue>;
  ruleId?: number;
}
export type TermData = {
  term: string;
  translation?: string;
  [key: string]: unknown;
};
export interface ParserContext {
  source: string;
  cursor: number;
  terms?: TermData[];
}
export type ParseResult = { token: Token };
export declare const TokenizerPriority: {
  readonly HIGHEST: 1000;
  readonly STRUCTURE: 800;
  readonly TERM: 600;
  readonly VARIABLE: 400;
  readonly LITERAL: 200;
  readonly LOWEST: 0;
};
export type TokenizerPriority =
  (typeof TokenizerPriority)[keyof typeof TokenizerPriority];
export declare const TokenSchema: ZodType<Token>;
export declare abstract class Tokenizer implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType;
  abstract getPriority(): TokenizerPriority;
  abstract parse(
    ctx: ParserContext,
  ): ParseResult | Promise<ParseResult | undefined> | undefined;
}
export type TokenizeOptions = { terms?: TermData[] };
export declare const tokenize: (
  text: string,
  rules: Array<{ rule: Tokenizer; id: number }>,
  options?: TokenizeOptions,
) => Promise<Token[]>;
export declare const parseInner: (
  content: string,
  offsetInParent: number,
  rules: Array<{ rule: Tokenizer; id: number }>,
  options?: TokenizeOptions,
) => Promise<Token[]>;

export declare const QASeverityValues: readonly ["error", "warning", "info"];
export type QASeverity = (typeof QASeverityValues)[number];
export interface QAIssue {
  severity: QASeverity;
  message: string;
  targetTokenIndex?: number;
  ruleId?: string;
  ruleFamily?: string;
  confidence?: number;
  sourceSpan?: { start: number; end: number; quote?: string };
  targetSpan?: { start: number; end: number; quote?: string };
  defaultAction?:
    | "BLOCK_APPROVAL"
    | "NEEDS_REVIEW"
    | "INFORMATIONAL"
    | "PASS"
    | "SUPPRESSED";
  suggestedText?: string;
  metadata?: Record<string, unknown>;
}
export declare const QAIssueSchema: ZodType<QAIssue>;
export interface CheckContext {
  source: {
    text: string;
    languageId: string;
    tokens: Token[];
    flatTokens: Token[];
  };
  translation: {
    text: string;
    languageId: string;
    tokens: Token[];
    flatTokens: Token[];
  };
  terms: Array<{
    term: string;
    translation: string;
    definition: string | null;
  }>;
}
export declare abstract class QAChecker implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType;
  abstract check(ctx: CheckContext): Promise<QAIssue[]> | QAIssue[];
}

export type TranslationAdvice = {
  text: string;
  [key: string]: unknown;
};
export type GetSuggestionsContext = {
  source: { text: string; languageId: string; meta: JsonValue };
  terms: Array<{
    term: string;
    translation: string;
    concept: {
      subjects: Array<{
        name: string;
        defaultDefinition: string | null;
      }>;
      definition: string | null;
    };
    confidence: number;
  }>;
  memories: Array<{
    source: string;
    translation: string;
    confidence: number;
  }>;
  targetLanguageId: string;
};
export declare abstract class TranslationAdvisor implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType;
  abstract getDisplayName(): string;
  abstract advise(ctx: GetSuggestionsContext): Promise<TranslationAdvice[]>;
}

export type UnvectorizedTextData = {
  id: string | number;
  text: string;
  [key: string]: unknown;
};
export type VectorizedTextData = UnvectorizedTextData & { vector: number[] };
export type CanVectorizeContext = { languageId: string };
export type VectorizeContext = {
  elements: UnvectorizedTextData[];
  signal?: AbortSignal;
};
export declare abstract class TextVectorizer implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType;
  abstract canVectorize(ctx: CanVectorizeContext): boolean;
  abstract vectorize(ctx: VectorizeContext): Promise<VectorizedTextData[]>;
}

export type StoreContext = {
  chunks: Array<{ vector: number[]; chunkId: number }>;
};
export type RetrieveContext = { chunkIds: number[] };
export type CosineSimilarityContext = {
  vectors: number[][];
  chunkIdRange: number[];
  minSimilarity: number;
  maxAmount: number;
};
export type InitContext = { dimension: number };
export type UpdateDimensionContext = { dimension: number };
export declare abstract class VectorStorage implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType;
  abstract store(ctx: StoreContext): Promise<void>;
  abstract retrieve(
    ctx: RetrieveContext,
  ): Promise<Array<{ vector: number[]; chunkId: number }>>;
  abstract cosineSimilarity(
    ctx: CosineSimilarityContext,
  ): Promise<Array<{ chunkId: number; similarity: number }>>;
  abstract updateDimension(ctx: UpdateDimensionContext): Promise<void>;
  abstract init(ctx: InitContext): Promise<void>;
}

export type NlpToken = {
  text: string;
  start: number;
  end: number;
  [key: string]: unknown;
};
export type NlpSentence = { text: string; tokens: NlpToken[] };
export type NlpSegmentResult = {
  tokens: NlpToken[];
  sentences?: NlpSentence[];
};
export type NlpBatchSegmentResult = {
  results: Array<{ id: string; result: NlpSegmentResult }>;
};
export type NlpSegmentContext = {
  text: string;
  languageId: string;
  signal?: AbortSignal;
};
export type NlpBatchSegmentContext = {
  items: Array<{ id: string; text: string }>;
  languageId: string;
  signal?: AbortSignal;
};
export declare abstract class NlpWordSegmenter implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType;
  abstract getSupportedLanguages(): Promise<string[]>;
  abstract segment(ctx: NlpSegmentContext): Promise<NlpSegmentResult>;
  batchSegment(ctx: NlpBatchSegmentContext): Promise<NlpBatchSegmentResult>;
}

export type AgentToolConfirmationPolicy =
  | "auto_allow"
  | "session_trust"
  | "always_confirm";
export type AgentToolTarget = "server" | "client";
export interface AgentToolProviderToolDef {
  name: string;
  description: string;
  parameters: ZodObject;
  execute?(
    args: Record<string, unknown>,
    ctx: { traceId: string; sessionId: string; signal?: AbortSignal },
  ): Promise<unknown>;
  target?: AgentToolTarget;
  confirmationPolicy?: AgentToolConfirmationPolicy;
  timeoutMs?: number;
}
export interface AgentToolProvider extends IPluginService {
  getTools(): AgentToolProviderToolDef[];
}
export type ContextVariableMeta = {
  key: string;
  type: "boolean" | "json" | "number" | "string";
  name?: string;
  description?: string;
};
export type ContextProviderDependency = { key: string; optional: boolean };
export declare const ContextVariableMetaSchema: ZodType<ContextVariableMeta>;
export declare const ContextProviderDependencySchema: ZodType<ContextProviderDependency>;
export type ContextResolveContext = {
  resolvedVars: ReadonlyMap<string, string | number | boolean>;
  drizzle: unknown;
  checkPermission(resource: string, action: string): Promise<boolean>;
};
export interface AgentContextProvider extends IPluginService {
  getType(): "AGENT_CONTEXT_PROVIDER";
  getProvides(): ContextVariableMeta[];
  getDependencies(): ContextProviderDependency[];
  resolve(
    ctx: ContextResolveContext,
  ): Promise<Map<string, string | number | boolean>>;
}

export declare abstract class EmailProviderService implements IPluginService {
  abstract getId(): string;
  getType(): "EMAIL_PROVIDER";
  abstract sendEmail(options: {
    to: string;
    subject: string;
    body: string;
    html?: string;
  }): Promise<void>;
}

export type PluginManifest = {
  id: string;
  entry: string;
  [key: string]: unknown;
};
export type PluginData = PluginManifest & {
  name: string;
  version: string;
  overview?: string | null;
};
export interface PluginLoader {
  getManifest(pluginId: string): Promise<PluginManifest>;
  getData(pluginId: string): Promise<PluginData>;
  getInstance(pluginId: string): Promise<CatPlugin>;
  listAvailablePlugins(): Promise<PluginManifest[]>;
  resolveAssetPath?(
    pluginId: string,
    relativePath: string,
  ): Promise<string | null>;
}
export declare class FileSystemPluginLoader implements PluginLoader {
  constructor(pluginsDir?: string);
  getManifest(pluginId: string): Promise<PluginManifest>;
  getData(pluginId: string): Promise<PluginData>;
  getInstance(pluginId: string): Promise<CatPlugin>;
  listAvailablePlugins(): Promise<PluginManifest[]>;
  resolveAssetPath(
    pluginId: string,
    relativePath: string,
  ): Promise<string | null>;
}
export type BuiltinPluginEntry = {
  manifest: PluginManifest;
  data: PluginData;
  load(): CatPlugin | Promise<CatPlugin>;
  assetRoot?: string;
};
export declare class BuiltinPluginLoader implements PluginLoader {
  constructor(entries: BuiltinPluginEntry[]);
  getManifest(pluginId: string): Promise<PluginManifest>;
  getData(pluginId: string): Promise<PluginData>;
  getInstance(pluginId: string): Promise<CatPlugin>;
  listAvailablePlugins(): Promise<PluginManifest[]>;
  resolveAssetPath(
    pluginId: string,
    relativePath: string,
  ): Promise<string | null>;
}
export declare class CompositePluginLoader implements PluginLoader {
  constructor(loaders: PluginLoader[]);
  getManifest(pluginId: string): Promise<PluginManifest>;
  getData(pluginId: string): Promise<PluginData>;
  getInstance(pluginId: string): Promise<CatPlugin>;
  listAvailablePlugins(): Promise<PluginManifest[]>;
  resolveAssetPath(
    pluginId: string,
    relativePath: string,
  ): Promise<string | null>;
}

export declare class ComponentRegistry {
  getSlot(slot: string): ComponentRecord[];
  get(pluginId: string): ComponentRecord[];
  combine(pluginId: string, components: ComponentRecord[]): void;
  removeByPlugin(pluginId: string): void;
}
export declare const ReigsteredServiceSchema: ZodType<RegisteredService>;
export declare class ServiceRegistry {
  constructor(initialServices?: RegisteredService[]);
  get(
    pluginId: string,
    type: PluginServiceType,
    id: string,
  ): RegisteredService | null;
  getAll(): RegisteredService[];
  combine(
    drizzle: unknown,
    scopeType: ScopeType,
    scopeId: string,
    pluginId: string,
    services: IPluginService[],
  ): Promise<void>;
  removeByPlugin(pluginId: string): void;
  clear(): void;
}
export declare class PluginRouteRegistry {
  register(pluginId: string, app: Hono): void;
  remove(pluginId: string): void;
  resolve(pluginId: string): Hono | undefined;
}
export declare class PluginDiscoveryService {
  constructor(loader?: PluginLoader);
  static getInstance(loader?: PluginLoader): PluginDiscoveryService;
  static clear(): void;
  getLoader(): PluginLoader;
  syncDefinitions(drizzle: unknown): Promise<void>;
  registerDefinition(drizzle: unknown, pluginId: string): Promise<void>;
}
export type DefaultPluginSource = string | string[];
export type PluginRuntimeSnapshot = {
  isActive: boolean;
  services: RegisteredService[];
  components: ComponentRecord[];
  hasRoute: boolean;
};
export declare class PluginManager {
  readonly scopeType: ScopeType;
  readonly scopeId: string;
  constructor(
    scopeType: ScopeType,
    scopeId: string,
    loader?: PluginLoader,
    discovery?: PluginDiscoveryService,
    serviceRegistry?: ServiceRegistry,
    componentRegistry?: ComponentRegistry,
  );
  static get(
    scopeType: ScopeType,
    scopeId: string,
    loader?: PluginLoader,
  ): PluginManager;
  static clear(): void;
  static installDefaults(
    drizzle: unknown,
    manager: PluginManager,
    defaultPlugins: DefaultPluginSource,
  ): Promise<void>;
  install(drizzle: unknown, pluginId: string): Promise<void>;
  uninstall(drizzle: unknown, pluginId: string): Promise<void>;
  restore(drizzle: unknown): Promise<void>;
  activate(drizzle: unknown, pluginId: string): Promise<void>;
  deactivate(drizzle: unknown, pluginId: string): Promise<void>;
  reloadPlugin(drizzle: unknown, pluginId: string): Promise<void>;
  isActive(pluginId: string): boolean;
  getRuntimeSnapshot(pluginId: string): PluginRuntimeSnapshot;
  createTransientServices(
    drizzle: unknown,
    pluginId: string,
    configOverride: JsonValue,
  ): Promise<IPluginService[]>;
  getRouteRegistry(): PluginRouteRegistry;
  getService<T extends PluginServiceType>(
    pluginId: string,
    type: T,
    id: string,
  ): RegisteredService | null;
  getAllServices(): RegisteredService[];
  getServices<T extends PluginServiceType>(type: T): RegisteredService[];
  getComponents(pluginId: string): ComponentRecord[];
  getComponentOfSlot(slot: string): ComponentRecord[];
  getLoader(): PluginLoader;
  getDiscovery(): PluginDiscoveryService;
}
