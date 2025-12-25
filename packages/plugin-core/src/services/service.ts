import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";

export interface IPluginService {
  getId(): string;
  getType(): PluginServiceType;
}
