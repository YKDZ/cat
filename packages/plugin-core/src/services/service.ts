import type { PluginServiceType } from "@cat/shared";

/**
 * @zh 插件服务的运行时可用性摘要。
 * @en Runtime availability summary for a plugin service.
 */
export type PluginServiceAvailability = {
  /** @zh 服务当前是否可用。 @en Whether the service is currently available. */
  available: boolean;
  /** @zh 可用性原因代码。 @en Availability reason code. */
  reason:
    | "ok"
    | "missing-config"
    | "disabled-by-runtime"
    | "remote-unreachable";
  /** @zh 给 UI / probe 使用的补充说明。 @en Optional detail for UI/probe surfaces. */
  message?: string;
};

/**
 * @zh 为插件服务暴露结构化可用性探测的协议。
 * @en Protocol for plugin services that expose structured availability probing.
 */
export interface PluginServiceAvailabilityProbe {
  /**
   * @zh 返回当前服务的可用性状态。
   * @en Return the current availability state of the service.
   *
   * @returns - {@zh 结构化可用性摘要} {@en Structured availability summary}
   */
  getAvailability():
    | Promise<PluginServiceAvailability>
    | PluginServiceAvailability;
}

export interface IPluginService {
  getId(): string;
  getType(): PluginServiceType;
}

/**
 * @zh 表示插件服务当前不可用的结构化错误。
 * @en Structured error indicating that a plugin service is currently unavailable.
 */
export class PluginServiceUnavailableError extends Error {
  public constructor(public readonly availability: PluginServiceAvailability) {
    super(availability.message ?? availability.reason);
  }
}

/**
 * @zh 判断插件服务是否实现了 availability probe 协议。
 * @en Determine whether a plugin service implements the availability probe protocol.
 *
 * @param service - {@zh 待检测的插件服务} {@en Plugin service to inspect}
 * @returns - {@zh 是否实现 availability probe} {@en Whether the service implements the availability probe}
 */
export const hasAvailabilityProbe = (
  service: IPluginService,
): service is IPluginService & PluginServiceAvailabilityProbe => {
  return (
    "getAvailability" in service &&
    typeof Reflect.get(service, "getAvailability") === "function"
  );
};
