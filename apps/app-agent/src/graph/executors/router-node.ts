import type { NodeExecutor } from "@/graph/node-registry";

import { buildPatch } from "@/graph/blackboard";

import { resolvePath } from "./utils";

type RouteLike = {
  condition?: {
    type: "expression" | "schema_match" | "blackboard_field";
    value: string;
  };
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
    let condition: RouteLike["condition"];
    if (typeof conditionLike === "object" && conditionLike !== null) {
      const type = Reflect.get(conditionLike, "type");
      const conditionValue = Reflect.get(conditionLike, "value");
      if (
        (type === "expression" ||
          type === "schema_match" ||
          type === "blackboard_field") &&
        typeof conditionValue === "string"
      ) {
        condition = { type, value: conditionValue };
      }
    }

    routes.push({
      condition,
      target,
      label,
    });
  }

  return routes;
};

const evaluate = (
  condition: RouteLike["condition"],
  data: unknown,
): boolean => {
  if (!condition) return true;

  if (condition.type === "schema_match") {
    const value = resolvePath(data, condition.value);
    return value !== undefined && value !== null;
  }

  const [pathRaw, expectedRaw] = condition.value.split("==");
  if (!pathRaw || expectedRaw === undefined) return false;

  const actual = resolvePath(data, pathRaw.trim());
  const expected = expectedRaw.trim();
  if (expected === "true") return actual === true;
  if (expected === "false") return actual === false;
  return String(actual) === expected;
};

export const RouterNodeExecutor: NodeExecutor = async (ctx, config) => {
  const routes = toRoutes(config.routes);
  const defaultTarget =
    typeof config.defaultTarget === "string" ? config.defaultTarget : undefined;

  for (const route of routes) {
    const matched = evaluate(route.condition, ctx.snapshot.data);
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
