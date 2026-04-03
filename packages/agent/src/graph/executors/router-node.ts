import type { EdgeCondition } from "@cat/graph";

import { EdgeConditionSchema, evaluateCondition } from "@cat/graph";

import type { NodeExecutor } from "@/graph/node-registry";

import { buildPatch } from "@/graph/blackboard";

type RouteLike = {
  condition?: EdgeCondition;
  target: string;
  label?: string;
};

const toRoutes = (value: unknown): RouteLike[] => {
  if (!Array.isArray(value)) return [];

  const routes: RouteLike[] = [];

  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;

    const target = Reflect.get(item, "target");
    if (typeof target !== "string") continue;

    const labelLike = Reflect.get(item, "label");
    const label = typeof labelLike === "string" ? labelLike : undefined;

    const conditionLike = Reflect.get(item, "condition");
    const parsedCondition = EdgeConditionSchema.safeParse(conditionLike);
    const condition = parsedCondition.success
      ? parsedCondition.data
      : undefined;

    routes.push({ condition, target, label });
  }

  return routes;
};

export const RouterNodeExecutor: NodeExecutor = async (ctx, config) => {
  const routes = toRoutes(config.routes);
  const defaultTarget =
    typeof config.defaultTarget === "string" ? config.defaultTarget : undefined;

  for (const route of routes) {
    const matched =
      !route.condition || evaluateCondition(route.condition, ctx.snapshot.data);
    if (!matched) continue;

    return {
      patch: buildPatch({
        actorId: ctx.nodeId,
        parentSnapshotVersion: ctx.snapshot.version,
        updates: {
          __nextNode: route.target,
          __routerDecision: route.label ?? route.target,
        },
      }),
      status: "completed",
    };
  }

  if (defaultTarget) {
    return {
      patch: buildPatch({
        actorId: ctx.nodeId,
        parentSnapshotVersion: ctx.snapshot.version,
        updates: {
          __nextNode: defaultTarget,
          __routerDecision: "default",
        },
      }),
      status: "completed",
    };
  }

  throw new Error(
    `Router node has no matched route and no defaultTarget: ${ctx.nodeId}`,
  );
};
