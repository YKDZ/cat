import type { UnvectorizedTextData } from "@cat/shared/schema/misc";
import type { IPluginService } from "@/registry/plugin-registry.ts";

export interface TextVectorizer extends IPluginService {
  canVectorize(languageId: string): boolean;
  vectorize(
    languageId: string,
    elements: UnvectorizedTextData[],
  ): Promise<number[][]>;
}
