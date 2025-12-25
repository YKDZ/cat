import type { IPluginService } from "@/services/service";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";
import type {
  UnvectorizedTextData,
  VectorizedTextData,
} from "@cat/shared/schema/misc";

export abstract class TextVectorizer implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "TEXT_VECTORIZER";
  }
  abstract canVectorize(languageId: string): boolean;
  abstract vectorize(
    elements: UnvectorizedTextData[],
  ): Promise<VectorizedTextData[]>;
}
