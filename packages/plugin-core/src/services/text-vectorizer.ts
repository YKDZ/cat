import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";
import type {
  UnvectorizedTextData,
  VectorizedTextData,
} from "@cat/shared/schema/misc";

import type { IPluginService } from "@/services/service";

export type CanVectorizeContext = {
  languageId: string;
};

export type VectorizeContext = {
  elements: UnvectorizedTextData[];
  /** Optional AbortSignal to cancel the vectorization request */
  signal?: AbortSignal;
};

export abstract class TextVectorizer implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "TEXT_VECTORIZER";
  }
  abstract canVectorize(ctx: CanVectorizeContext): boolean;
  abstract vectorize(ctx: VectorizeContext): Promise<VectorizedTextData[]>;
}
