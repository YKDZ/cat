import type { PluginServiceType } from "@cat/shared";

export interface IPluginService {
  getId(): string;
  getType(): PluginServiceType;
}
