import type { AppRouter } from "@cat/app-api/orpc/router";
import type { RouterClient } from "@orpc/server";

type PluginRouter = RouterClient<AppRouter>["plugin"];

/**
 * Return type of the plugin detail procedure.
 */
export type PluginDetail = Awaited<ReturnType<PluginRouter["getDetail"]>>;

/**
 * Non-null plugin detail type.
 */
export type NonNullPluginDetail = NonNullable<PluginDetail>;

/**
 * Result type for plugin lifecycle actions.
 */
export type PluginActionResult = Awaited<ReturnType<PluginRouter["install"]>>;

/**
 * Result type for plugin configuration probes.
 */
export type PluginProbeResult = Awaited<
  ReturnType<PluginRouter["probeConfig"]>
>;
