import type {
  LLMProvider,
  NlpWordSegmenter,
  RerankProvider,
  StorageProvider,
  TextVectorizer,
  TranslationAdvisor,
} from "@cat/plugin-core";
import type { NonNullJSONType, PluginServiceType } from "@cat/shared";

import { PluginManager, type IPluginService } from "@cat/plugin-core";
import { ORPCError } from "@orpc/client";

import type { Context } from "@/utils/context";

import type {
  PluginProbeResult,
  PluginProbeServiceResult,
  ProbePluginConfigInput,
} from "./plugin-schemas";

import {
  assertConfigValueMatchesSchema,
  getPluginDetailModel,
} from "./plugin-management";
import { errorMessage, redactJson } from "./plugin-redaction";

const DEFAULT_TIMEOUT_MS = 8_000;

const billable = (serviceType: PluginServiceType): boolean => {
  return [
    "LLM_PROVIDER",
    "TEXT_VECTORIZER",
    "RERANK_PROVIDER",
    "TRANSLATION_ADVISOR",
  ].includes(serviceType);
};

const unsupportedReason = (serviceType: PluginServiceType): string | null => {
  if (serviceType === "EMAIL_PROVIDER") {
    return "邮件服务不执行通用检测，以避免误发邮件。";
  }
  if (serviceType === "VECTOR_STORAGE") {
    return "向量存储没有通用的低副作用检测方式。";
  }
  if (
    ![
      "LLM_PROVIDER",
      "TEXT_VECTORIZER",
      "RERANK_PROVIDER",
      "STORAGE_PROVIDER",
      "TRANSLATION_ADVISOR",
      "NLP_WORD_SEGMENTER",
    ].includes(serviceType)
  ) {
    return "此服务类型没有平台内置通用检测。";
  }
  return null;
};

const combineSignals = (
  requestSignal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal => {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!requestSignal) return timeoutSignal;
  return AbortSignal.any([requestSignal, timeoutSignal]);
};

const abortError = (signal: AbortSignal): DOMException => {
  if (signal.reason instanceof DOMException) {
    return signal.reason;
  }
  if (signal.reason instanceof Error) {
    return new DOMException(signal.reason.message, "AbortError");
  }
  if (typeof signal.reason === "string" && signal.reason.length > 0) {
    return new DOMException(signal.reason, "AbortError");
  }
  return new DOMException("Aborted", "AbortError");
};

const timed = async <T>(
  serviceType: PluginServiceType,
  serviceId: string,
  signal: AbortSignal,
  run: () => Promise<T>,
): Promise<{
  value: T | null;
  resultBase: Omit<
    PluginProbeServiceResult,
    "status" | "summary" | "warnings" | "error"
  >;
  error: unknown;
}> => {
  const started = performance.now();
  const resultBase: Omit<
    PluginProbeServiceResult,
    "status" | "summary" | "warnings" | "error"
  > = {
    serviceType,
    serviceId,
    billable: billable(serviceType),
    latencyMs: null,
  };
  let onAbort: (() => void) | null = null;

  try {
    if (signal.aborted) {
      throw abortError(signal);
    }
    const abortPromise = new Promise<never>((_, reject) => {
      onAbort = () => {
        reject(abortError(signal));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
    const value = await Promise.race([run(), abortPromise]);
    resultBase.latencyMs = Math.round(performance.now() - started);
    return {
      value,
      resultBase,
      error: null,
    };
  } catch (error) {
    resultBase.latencyMs = Math.round(performance.now() - started);
    return {
      value: null,
      resultBase,
      error,
    };
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
};

const failedResult = (
  serviceType: PluginServiceType,
  serviceId: string,
  error: unknown,
  latencyMs: number | null,
): PluginProbeServiceResult => {
  const name = error instanceof DOMException ? error.name : undefined;
  const message = errorMessage(error);
  const timeout =
    name === "TimeoutError" || message.toLowerCase().includes("timeout");
  const cancelled =
    !timeout &&
    (name === "AbortError" || message.toLowerCase().includes("aborted"));
  return {
    serviceType,
    serviceId,
    status: cancelled ? "CANCELLED" : "FAILED",
    billable: billable(serviceType),
    latencyMs,
    summary: {},
    warnings: [],
    error: {
      category: cancelled ? "CANCELLED" : timeout ? "TIMEOUT" : "UNKNOWN",
      message,
    },
  };
};

const probeLlm = async (
  service: LLMProvider,
  signal: AbortSignal,
): Promise<PluginProbeServiceResult> => {
  const serviceType = "LLM_PROVIDER" as const;
  const serviceId = service.getId();
  const { value, resultBase, error } = await timed(
    serviceType,
    serviceId,
    signal,
    async () => {
      let text = "";
      let usage: unknown = null;
      let finishReason: string | null = null;
      for await (const chunk of service.chat({
        messages: [{ role: "user", content: "Reply with OK." }],
        maxTokens: 8,
        temperature: 0,
        thinking: false,
        signal,
      })) {
        if (chunk.type === "text_delta") text += chunk.textDelta;
        if (chunk.type === "usage") usage = chunk.usage;
        if (chunk.type === "finish") finishReason = chunk.finishReason;
        if (chunk.type === "error") throw chunk.error;
      }
      return { text: text.slice(0, 120), usage, finishReason };
    },
  );
  if (error)
    return failedResult(serviceType, serviceId, error, resultBase.latencyMs);
  return {
    ...resultBase,
    status: "SUCCESS",
    summary: redactJson({ model: service.getModelName(), ...value }),
    warnings: ["此检测可能消耗外部服务配额。"],
    error: null,
  };
};

const probeTextVectorizer = async (
  service: TextVectorizer,
  signal: AbortSignal,
): Promise<PluginProbeServiceResult> => {
  const serviceType = "TEXT_VECTORIZER" as const;
  const serviceId = service.getId();
  const { value, resultBase, error } = await timed(
    serviceType,
    serviceId,
    signal,
    async () => {
      const vectors = await service.vectorize({
        elements: [{ text: "hello world", languageId: "en" }],
        signal,
      });
      return {
        vectorCount: vectors.length,
        dimension: vectors[0]?.[0]?.vector.length ?? 0,
        meta: vectors[0]?.[0]?.meta ?? {},
      };
    },
  );
  if (error)
    return failedResult(serviceType, serviceId, error, resultBase.latencyMs);
  return {
    ...resultBase,
    status: "SUCCESS",
    summary: redactJson(value),
    warnings: ["此检测可能消耗外部服务配额。"],
    error: null,
  };
};

const probeRerank = async (
  service: RerankProvider,
  signal: AbortSignal,
): Promise<PluginProbeServiceResult> => {
  const serviceType = "RERANK_PROVIDER" as const;
  const serviceId = service.getId();
  const { value, resultBase, error } = await timed(
    serviceType,
    serviceId,
    signal,
    async () => {
      const response = await service.rerank({
        signal,
        request: {
          trigger: "precision-ambiguity",
          surface: "memory",
          queryText: "save changes",
          band: { start: 0, end: 2, reasons: ["probe"] },
          candidates: [
            {
              candidateId: "a",
              surface: "memory",
              originalIndex: 0,
              originalConfidence: 0.5,
              title: "A",
              sourceText: "save",
              targetText: "保存",
            },
            {
              candidateId: "b",
              surface: "memory",
              originalIndex: 1,
              originalConfidence: 0.4,
              title: "B",
              sourceText: "cancel",
              targetText: "取消",
            },
          ],
          timeoutMs: DEFAULT_TIMEOUT_MS,
        },
      });
      return {
        model: service.getModelName(),
        scoreCount: response.scores.length,
        metadata: response.metadata ?? {},
      };
    },
  );
  if (error)
    return failedResult(serviceType, serviceId, error, resultBase.latencyMs);
  return {
    ...resultBase,
    status: "SUCCESS",
    summary: redactJson(value),
    warnings: ["此检测可能消耗外部服务配额。"],
    error: null,
  };
};

const probeStorage = async (
  service: StorageProvider,
  signal: AbortSignal,
): Promise<PluginProbeServiceResult> => {
  const serviceType = "STORAGE_PROVIDER" as const;
  const serviceId = service.getId();
  const { resultBase, error } = await timed(
    serviceType,
    serviceId,
    signal,
    async () => {
      await service.ping();
      return { reachable: true };
    },
  );
  if (error)
    return failedResult(serviceType, serviceId, error, resultBase.latencyMs);
  return {
    ...resultBase,
    status: "SUCCESS",
    summary: { reachable: true },
    warnings: [],
    error: null,
  };
};

const probeTranslationAdvisor = async (
  service: TranslationAdvisor,
  signal: AbortSignal,
): Promise<PluginProbeServiceResult> => {
  const serviceType = "TRANSLATION_ADVISOR" as const;
  const serviceId = service.getId();
  const { value, resultBase, error } = await timed(
    serviceType,
    serviceId,
    signal,
    async () => {
      const suggestions = await service.advise({
        source: { text: "Hello", languageId: "en", meta: {} },
        terms: [],
        memories: [],
        targetLanguageId: "zh-Hans",
      });
      return {
        displayName: service.getDisplayName(),
        suggestionCount: suggestions.length,
        sample: suggestions[0]?.translation ?? null,
      };
    },
  );
  if (error)
    return failedResult(serviceType, serviceId, error, resultBase.latencyMs);
  return {
    ...resultBase,
    status: "SUCCESS",
    summary: redactJson(value),
    warnings: ["此检测可能消耗外部服务配额。"],
    error: null,
  };
};

const probeNlpSegmenter = async (
  service: NlpWordSegmenter,
  signal: AbortSignal,
): Promise<PluginProbeServiceResult> => {
  const serviceType = "NLP_WORD_SEGMENTER" as const;
  const serviceId = service.getId();
  const { value, resultBase, error } = await timed(
    serviceType,
    serviceId,
    signal,
    async () => {
      const languages = await service.getSupportedLanguages();
      const segmented =
        languages.length > 0
          ? await service.segment({
              text: "Hello world",
              languageId: languages[0],
              signal,
            })
          : null;
      return { languages, tokenCount: segmented?.tokens.length ?? 0 };
    },
  );
  if (error)
    return failedResult(serviceType, serviceId, error, resultBase.latencyMs);
  return {
    ...resultBase,
    status: "SUCCESS",
    summary: redactJson(value),
    warnings: [],
    error: null,
  };
};

const unsupported = (service: IPluginService): PluginProbeServiceResult => {
  const serviceType = service.getType();
  return {
    serviceType,
    serviceId: service.getId(),
    status: "UNSUPPORTED",
    billable: billable(serviceType),
    latencyMs: null,
    summary: {},
    warnings: [],
    error: {
      category: "UNSUPPORTED",
      message:
        unsupportedReason(serviceType) ?? "此服务类型不支持平台内置检测。",
    },
  };
};

const incompatibleService = (
  service: IPluginService,
): PluginProbeServiceResult => {
  const serviceType = service.getType();
  return {
    serviceType,
    serviceId: service.getId(),
    status: "FAILED",
    billable: billable(serviceType),
    latencyMs: null,
    summary: {},
    warnings: [],
    error: {
      category: "UNKNOWN",
      message: "插件服务实现与声明的类型不匹配。",
    },
  };
};

const hasFunction = (value: object, key: string): boolean => {
  return typeof Reflect.get(value, key) === "function";
};

const isLlmProvider = (service: IPluginService): service is LLMProvider => {
  return service.getType() === "LLM_PROVIDER" && hasFunction(service, "chat");
};

const isTextVectorizer = (
  service: IPluginService,
): service is TextVectorizer => {
  return (
    service.getType() === "TEXT_VECTORIZER" && hasFunction(service, "vectorize")
  );
};

const isRerankProvider = (
  service: IPluginService,
): service is RerankProvider => {
  return (
    service.getType() === "RERANK_PROVIDER" && hasFunction(service, "rerank")
  );
};

const isStorageProvider = (
  service: IPluginService,
): service is StorageProvider => {
  return (
    service.getType() === "STORAGE_PROVIDER" && hasFunction(service, "ping")
  );
};

const isTranslationAdvisor = (
  service: IPluginService,
): service is TranslationAdvisor => {
  return (
    service.getType() === "TRANSLATION_ADVISOR" &&
    hasFunction(service, "advise")
  );
};

const isNlpWordSegmenter = (
  service: IPluginService,
): service is NlpWordSegmenter => {
  return (
    service.getType() === "NLP_WORD_SEGMENTER" &&
    hasFunction(service, "segment")
  );
};

const probeService = async (
  service: IPluginService,
  signal: AbortSignal,
): Promise<PluginProbeServiceResult> => {
  switch (service.getType()) {
    case "AGENT_CONTEXT_PROVIDER":
    case "AGENT_TOOL_PROVIDER":
    case "AUTH_FACTOR":
    case "EMAIL_PROVIDER":
    case "FILE_EXPORTER":
    case "FILE_IMPORTER":
    case "QA_CHECKER":
    case "TOKENIZER":
    case "VECTOR_STORAGE":
      return unsupported(service);
    case "LLM_PROVIDER":
      return isLlmProvider(service)
        ? await probeLlm(service, signal)
        : incompatibleService(service);
    case "TEXT_VECTORIZER":
      return isTextVectorizer(service)
        ? await probeTextVectorizer(service, signal)
        : incompatibleService(service);
    case "RERANK_PROVIDER":
      return isRerankProvider(service)
        ? await probeRerank(service, signal)
        : incompatibleService(service);
    case "STORAGE_PROVIDER":
      return isStorageProvider(service)
        ? await probeStorage(service, signal)
        : incompatibleService(service);
    case "TRANSLATION_ADVISOR":
      return isTranslationAdvisor(service)
        ? await probeTranslationAdvisor(service, signal)
        : incompatibleService(service);
    case "NLP_WORD_SEGMENTER":
      return isNlpWordSegmenter(service)
        ? await probeNlpSegmenter(service, signal)
        : incompatibleService(service);
    default:
      return unsupported(service);
  }
};

const overallStatus = (
  results: PluginProbeServiceResult[],
): PluginProbeResult["overallStatus"] => {
  if (results.length === 0) return "UNSUPPORTED";
  if (results.every((result) => result.status === "SUCCESS")) return "SUCCESS";
  if (results.every((result) => result.status === "UNSUPPORTED"))
    return "UNSUPPORTED";
  if (results.some((result) => result.status === "CANCELLED"))
    return "CANCELLED";
  if (results.some((result) => result.status === "SUCCESS")) return "WARNING";
  return "FAILED";
};

const filterServices = (
  services: IPluginService[],
  serviceType: PluginServiceType | undefined,
): IPluginService[] => {
  if (!serviceType) return services;
  return services.filter((service) => service.getType() === serviceType);
};

const factoryFailureResults = async (
  manager: PluginManager,
  input: ProbePluginConfigInput,
  error: unknown,
): Promise<PluginProbeServiceResult[]> => {
  const manifest = await manager
    .getLoader()
    .getManifest(input.pluginId)
    .catch(() => null);
  const manifestServices = (manifest?.services ?? []).filter((service) => {
    return !input.serviceType || service.type === input.serviceType;
  });
  const fallbackServiceType: PluginServiceType =
    input.serviceType ?? "LLM_PROVIDER";
  const targets =
    manifestServices.length > 0
      ? manifestServices.map((service) => ({
          serviceType: service.type,
          serviceId: service.id ?? "dynamic",
        }))
      : [
          {
            serviceType: fallbackServiceType,
            serviceId: "service-factory",
          },
        ];

  return targets.map(({ serviceType, serviceId }) => ({
    serviceType,
    serviceId,
    status: "FAILED",
    billable: billable(serviceType),
    latencyMs: null,
    summary: {},
    warnings: [],
    error: {
      category: "UNKNOWN",
      message: errorMessage(error),
    },
  }));
};

const getValidatedCandidateValue = async (
  context: Context,
  input: ProbePluginConfigInput,
): Promise<NonNullJSONType> => {
  const value: NonNullJSONType = input.value ?? {};
  const detail = await getPluginDetailModel(context, input);

  if (!detail) {
    throw new ORPCError("NOT_FOUND", { message: "插件不存在" });
  }
  if (!detail.config.hasConfig || !detail.config.schema) {
    return {};
  }

  assertConfigValueMatchesSchema(detail.config.schema, value);
  return value;
};

/**
 * @zh 对候选配置或当前运行态配置执行平台内置检测。
 * @en Run the built-in platform probe against candidate or runtime plugin configuration.
 *
 * @param context - {@zh 当前请求上下文} {@en Current request context}
 * @param input - {@zh 插件检测输入} {@en Plugin probe input}
 * @returns - {@zh 结构化检测结果} {@en Structured probe result}
 */
export const probePluginConfig = async (
  context: Context,
  input: ProbePluginConfigInput,
): Promise<PluginProbeResult> => {
  const {
    drizzleDB: { client: drizzle },
  } = context;
  const manager = PluginManager.get(input.scopeType, input.scopeId);
  const signal = combineSignals(
    context.requestSignal,
    input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const candidateValue =
    input.target === "CANDIDATE"
      ? await getValidatedCandidateValue(context, input)
      : null;

  let services: IPluginService[];
  try {
    services =
      input.target === "CANDIDATE"
        ? await manager.createTransientServices(
            drizzle,
            input.pluginId,
            candidateValue ?? {},
          )
        : manager
            .getRuntimeSnapshot(input.pluginId)
            .services.map((entry) => entry.service);
  } catch (error) {
    const results = await factoryFailureResults(manager, input, error);
    return {
      target: input.target,
      overallStatus: overallStatus(results),
      results,
    };
  }

  const results = await Promise.all(
    filterServices(services, input.serviceType).map(async (service) => {
      return await probeService(service, signal);
    }),
  );

  return {
    target: input.target,
    overallStatus: overallStatus(results),
    results,
  };
};
