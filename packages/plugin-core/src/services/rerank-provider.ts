import type { PluginServiceType } from "@cat/shared/schema/enum";
import type {
  RerankProviderCall,
  RerankResponse,
} from "@cat/shared/schema/rerank";

import type { IPluginService } from "@/services/service";

export abstract class RerankProvider implements IPluginService {
  abstract getId(): string;

  getType(): PluginServiceType {
    return "RERANK_PROVIDER";
  }

  /** Human-readable backend model identifier for internal traces/eval only. */
  abstract getModelName(): string;

  abstract rerank(input: RerankProviderCall): Promise<RerankResponse>;
}
