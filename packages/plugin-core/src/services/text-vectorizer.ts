import type { IPluginService } from "@/services/service";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";
import type {
  UnvectorizedTextData,
  VectorizedTextData,
} from "@cat/shared/schema/misc";

export type CanVectorizeContext = {
  languageId: string;
};

export type VectorizeContext = {
  elements: UnvectorizedTextData[];
};

export abstract class TextVectorizer implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "TEXT_VECTORIZER";
  }
  abstract canVectorize(ctx: CanVectorizeContext): boolean;
  abstract vectorize(ctx: VectorizeContext): Promise<VectorizedTextData[]>;
}
