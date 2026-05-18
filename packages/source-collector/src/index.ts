export type {
  SourceExtractor,
  ExtractOptions,
  CollectOptions,
  SourceExtractOptions,
  PayloadRoutingOptions,
  SourceCollectionDiagnostic,
  SourceExtractionGraphResult,
} from "./types.ts";
export { normalizeI18nText } from "./extractors/stable-ref.ts";
export { vueI18nExtractor } from "./extractors/vue-i18n.ts";
export { collect } from "./collect.ts";
export { extract } from "./extract.ts";
export { toCollectionPayload } from "./adapter.ts";
