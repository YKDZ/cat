import type { PluginServiceType } from "@cat/shared/schema/enum";

export interface IPluginService {
  getId(): string;
  getType(): PluginServiceType;
}
