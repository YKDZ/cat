import type { AppRouter } from "@cat/app-api/orpc/router";
import type { RouterClient } from "@orpc/server";

type PluginRouter = RouterClient<AppRouter>["plugin"];

/**
 * @zh 插件详情接口的返回类型。
 * @en Return type of the plugin detail procedure.
 */
export type PluginDetail = Awaited<ReturnType<PluginRouter["getDetail"]>>;

/**
 * @zh 非空插件详情类型。
 * @en Non-null plugin detail type.
 */
export type NonNullPluginDetail = NonNullable<PluginDetail>;

/**
 * @zh 插件生命周期动作结果类型。
 * @en Result type for plugin lifecycle actions.
 */
export type PluginActionResult = Awaited<ReturnType<PluginRouter["install"]>>;

/**
 * @zh 插件配置检测结果类型。
 * @en Result type for plugin configuration probes.
 */
export type PluginProbeResult = Awaited<
  ReturnType<PluginRouter["probeConfig"]>
>;
