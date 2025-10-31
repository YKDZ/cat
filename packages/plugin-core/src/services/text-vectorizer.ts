import { IPluginService } from "@/registry/plugin-registry";
import type {
  UnvectorizedTextData,
  VectorizedTextData,
} from "@cat/shared/schema/misc";

export interface TextVectorizer extends IPluginService {
  canVectorize(languageId: string): boolean;
  vectorize(elements: UnvectorizedTextData[]): Promise<VectorizedTextData[]>;
}
