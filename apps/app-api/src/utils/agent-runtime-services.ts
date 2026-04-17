import type { PreCheckServices } from "@cat/agent";

/**
 * @zh 创建 AgentRuntime 需要的 PreCheck 服务集合。
 * @en Create the PreCheck service set required by AgentRuntime.
 *
 * @returns - {@zh 可注入到 AgentRuntime 的 PreCheck 服务} {@en PreCheck services injectable into AgentRuntime}
 */
export const createPreCheckServices = (): PreCheckServices => ({});
