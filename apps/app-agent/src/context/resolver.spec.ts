import type { DrizzleClient } from "@cat/db";
import type {
  AgentContextProvider,
  ContextProviderDependency,
  ContextResolveContext,
  ContextVariableMeta,
} from "@cat/plugin-core";

import { describe, expect, it, vi } from "vitest";

import { resolveContextVariables } from "./resolver.ts";
import { CircularDependencyError } from "./topo-sort.ts";

// ─── Helpers ───

/** 伪造的 DrizzleClient，测试中不执行任何 DB 操作 */
// oxlint-disable-next-line no-unsafe-type-assertion
const mockDrizzle = {} as unknown as DrizzleClient;

/** 构造一个简单的 mock AgentContextProvider，同时返回 spy 供断言 */
const makeProvider = (opts: {
  id: string;
  provides: ContextVariableMeta[];
  dependencies?: ContextProviderDependency[];
  resolveResult: Map<string, string | number | boolean>;
}): {
  provider: AgentContextProvider;
  resolveSpy: ReturnType<typeof vi.fn>;
} => {
  const resolveSpy = vi.fn().mockResolvedValue(opts.resolveResult);
  const provider: AgentContextProvider = {
    getId: () => opts.id,
    getType: () => "AGENT_CONTEXT_PROVIDER",
    getProvides: () => opts.provides,
    getDependencies: () => opts.dependencies ?? [],
    resolve: resolveSpy,
  };
  return { provider, resolveSpy };
};

const makeMeta = (key: string): ContextVariableMeta => ({
  key,
  type: "string",
  name: key,
});

// ─── Tests ───

describe("resolveContextVariables", () => {
  // ── 基础情况 ────────────────────────────────────────────────────────────────

  it("没有 provider 时直接返回种子变量", async () => {
    const seeds = new Map<string, string | number | boolean>([
      ["userId", "user-1"],
      ["projectId", "proj-1"],
    ]);
    const result = await resolveContextVariables({
      seeds,
      providers: [],
      drizzle: mockDrizzle,
    });
    expect(result.get("userId")).toBe("user-1");
    expect(result.get("projectId")).toBe("proj-1");
  });

  it("种子变量为空时仍能正常运行", async () => {
    const result = await resolveContextVariables({
      seeds: new Map(),
      providers: [],
      drizzle: mockDrizzle,
    });
    expect(result.size).toBe(0);
  });

  // ── Provider 解析 ──────────────────────────────────────────────────────────

  it("单个无依赖 provider 的变量被合并到结果中", async () => {
    const { provider, resolveSpy } = makeProvider({
      id: "p1",
      provides: [makeMeta("greeting")],
      resolveResult: new Map([["greeting", "hello"]]),
    });

    const result = await resolveContextVariables({
      seeds: new Map([["userId", "u1"]]),
      providers: [provider],
      drizzle: mockDrizzle,
    });

    expect(result.get("userId")).toBe("u1");
    expect(result.get("greeting")).toBe("hello");
    expect(resolveSpy).toHaveBeenCalledOnce();
  });

  it("provider 接收到含种子变量的 resolvedVars", async () => {
    let capturedCtx: ContextResolveContext | undefined;

    const captureProvider: AgentContextProvider = {
      getId: () => "capture",
      getType: () => "AGENT_CONTEXT_PROVIDER",
      getProvides: () => [makeMeta("result")],
      getDependencies: () => [],
      resolve: async (ctx) => {
        capturedCtx = ctx;
        return new Map([["result", "ok"]]);
      },
    };

    await resolveContextVariables({
      seeds: new Map([["myKey", "myValue"]]),
      providers: [captureProvider],
      drizzle: mockDrizzle,
    });

    expect(capturedCtx?.resolvedVars.get("myKey")).toBe("myValue");
  });

  it("provider 接收到 drizzle 客户端", async () => {
    let capturedDrizzle: DrizzleClient | undefined;

    const dbCheckProvider: AgentContextProvider = {
      getId: () => "db-check",
      getType: () => "AGENT_CONTEXT_PROVIDER",
      getProvides: () => [makeMeta("x")],
      getDependencies: () => [],
      resolve: async (ctx) => {
        capturedDrizzle = ctx.drizzle;
        return new Map([["x", 1]]);
      },
    };

    await resolveContextVariables({
      seeds: new Map(),
      providers: [dbCheckProvider],
      drizzle: mockDrizzle,
    });

    expect(capturedDrizzle).toBe(mockDrizzle);
  });

  // ── 依赖链 ─────────────────────────────────────────────────────────────────

  it("依赖链：B 依赖 A 产出的 'a'，B 能读到 a 的值", async () => {
    const { provider: providerA } = makeProvider({
      id: "a",
      provides: [makeMeta("a")],
      resolveResult: new Map([["a", "value-a"]]),
    });

    let capturedA: string | number | boolean | undefined;
    const providerB: AgentContextProvider = {
      getId: () => "b",
      getType: () => "AGENT_CONTEXT_PROVIDER",
      getProvides: () => [makeMeta("b")],
      getDependencies: () => [{ key: "a", optional: false }],
      resolve: async (ctx) => {
        capturedA = ctx.resolvedVars.get("a");
        return new Map([["b", "value-b"]]);
      },
    };

    const result = await resolveContextVariables({
      seeds: new Map(),
      providers: [providerA, providerB],
      drizzle: mockDrizzle,
    });

    expect(capturedA).toBe("value-a");
    expect(result.get("b")).toBe("value-b");
  });

  it("多个 provider 的结果均被合并", async () => {
    const { provider: p1 } = makeProvider({
      id: "p1",
      provides: [makeMeta("v1")],
      resolveResult: new Map([["v1", "one"]]),
    });
    const { provider: p2 } = makeProvider({
      id: "p2",
      provides: [makeMeta("v2")],
      resolveResult: new Map([["v2", 2]]),
    });
    const { provider: p3 } = makeProvider({
      id: "p3",
      provides: [makeMeta("v3")],
      resolveResult: new Map([["v3", true]]),
    });

    const result = await resolveContextVariables({
      seeds: new Map(),
      providers: [p1, p2, p3],
      drizzle: mockDrizzle,
    });

    expect(result.get("v1")).toBe("one");
    expect(result.get("v2")).toBe(2);
    expect(result.get("v3")).toBe(true);
  });

  // ── 缺失依赖 ───────────────────────────────────────────────────────────────

  it("必需依赖缺失时 provider 被跳过（不写入结果）", async () => {
    const { provider, resolveSpy } = makeProvider({
      id: "needs-projectId",
      provides: [makeMeta("derived")],
      dependencies: [{ key: "projectId", optional: false }],
      resolveResult: new Map([["derived", "computed"]]),
    });

    const result = await resolveContextVariables({
      seeds: new Map(), // 没有 "projectId"
      providers: [provider],
      drizzle: mockDrizzle,
    });

    expect(result.has("derived")).toBe(false);
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it("可选依赖缺失时 provider 仍然被调用", async () => {
    const { provider, resolveSpy } = makeProvider({
      id: "optional-dep",
      provides: [makeMeta("result")],
      dependencies: [{ key: "maybeExists", optional: true }],
      resolveResult: new Map([["result", "achieved"]]),
    });

    const result = await resolveContextVariables({
      seeds: new Map(), // 没有 "maybeExists"
      providers: [provider],
      drizzle: mockDrizzle,
    });

    expect(result.get("result")).toBe("achieved");
    expect(resolveSpy).toHaveBeenCalledOnce();
  });

  it("种子变量中存在的必需依赖不被视为缺失", async () => {
    const { provider, resolveSpy } = makeProvider({
      id: "uses-seed",
      provides: [makeMeta("enriched")],
      dependencies: [{ key: "projectId", optional: false }],
      resolveResult: new Map([["enriched", "done"]]),
    });

    const result = await resolveContextVariables({
      seeds: new Map([["projectId", "proj-42"]]), // 种子中有 projectId
      providers: [provider],
      drizzle: mockDrizzle,
    });

    expect(result.get("enriched")).toBe("done");
    expect(resolveSpy).toHaveBeenCalledOnce();
  });

  // ── 权限检查 ───────────────────────────────────────────────────────────────

  it("权限被拒绝时 provider 被跳过", async () => {
    const { provider, resolveSpy } = makeProvider({
      id: "private-provider",
      provides: [makeMeta("secret")],
      resolveResult: new Map([["secret", "top-secret"]]),
    });

    const denyAll = vi.fn().mockResolvedValue(false);

    const result = await resolveContextVariables({
      seeds: new Map(),
      providers: [provider],
      drizzle: mockDrizzle,
      checkPermission: denyAll,
    });

    expect(result.has("secret")).toBe(false);
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(denyAll).toHaveBeenCalledWith(
      "context-provider:private-provider",
      "resolve",
    );
  });

  it("默认权限检查放行所有 provider", async () => {
    const { provider } = makeProvider({
      id: "open",
      provides: [makeMeta("value")],
      resolveResult: new Map([["value", "accessible"]]),
    });

    const result = await resolveContextVariables({
      seeds: new Map(),
      providers: [provider],
      drizzle: mockDrizzle,
      // 不传 checkPermission → 默认 pass-through
    });

    expect(result.get("value")).toBe("accessible");
  });

  // ── 错误处理 ───────────────────────────────────────────────────────────────

  it("provider.resolve 抛出异常时引擎不崩溃，继续处理其他 provider", async () => {
    const failingProvider: AgentContextProvider = {
      getId: () => "will-fail",
      getType: () => "AGENT_CONTEXT_PROVIDER",
      getProvides: () => [makeMeta("fromFailing")],
      getDependencies: () => [],
      resolve: async () => {
        throw new Error("intentional error");
      },
    };

    const { provider: successProvider } = makeProvider({
      id: "will-succeed",
      provides: [makeMeta("fromSuccess")],
      resolveResult: new Map([["fromSuccess", "ok"]]),
    });

    const result = await resolveContextVariables({
      seeds: new Map(),
      providers: [failingProvider, successProvider],
      drizzle: mockDrizzle,
    });

    // failing provider 没有写入结果
    expect(result.has("fromFailing")).toBe(false);
    // success provider 正常写入
    expect(result.get("fromSuccess")).toBe("ok");
  });

  it("循环依赖时抛出 CircularDependencyError", async () => {
    const circularA: AgentContextProvider = {
      getId: () => "a",
      getType: () => "AGENT_CONTEXT_PROVIDER",
      getProvides: () => [makeMeta("a")],
      getDependencies: () => [{ key: "b", optional: false }],
      resolve: async () => new Map(),
    };

    const circularB: AgentContextProvider = {
      getId: () => "b",
      getType: () => "AGENT_CONTEXT_PROVIDER",
      getProvides: () => [makeMeta("b")],
      getDependencies: () => [{ key: "a", optional: false }],
      resolve: async () => new Map(),
    };

    await expect(
      resolveContextVariables({
        seeds: new Map(),
        providers: [circularA, circularB],
        drizzle: mockDrizzle,
      }),
    ).rejects.toThrowError(CircularDependencyError);
  });

  // ── 并行执行 ───────────────────────────────────────────────────────────────

  it("同一拓扑层中的 provider 并发执行（全部在被调用前开始）", async () => {
    const order: string[] = [];

    const makeDelayedProvider = (
      id: string,
      delay: number,
    ): AgentContextProvider => ({
      getId: () => id,
      getType: () => "AGENT_CONTEXT_PROVIDER",
      getProvides: () => [makeMeta(id)],
      getDependencies: () => [],
      resolve: async () => {
        await new Promise<void>((r) => setTimeout(r, delay));
        order.push(id);
        return new Map([[id, id]]);
      },
    });

    // 两个独立 provider，较快的应先完成
    const pSlow = makeDelayedProvider("slow", 30);
    const pFast = makeDelayedProvider("fast", 5);

    await resolveContextVariables({
      seeds: new Map(),
      providers: [pSlow, pFast],
      drizzle: mockDrizzle,
    });

    // fast 先完成（并行执行）
    expect(order).toEqual(["fast", "slow"]);
  });

  // ── 变量覆盖 ───────────────────────────────────────────────────────────────

  it("provider 的输出可以覆盖种子变量", async () => {
    const { provider } = makeProvider({
      id: "override",
      provides: [makeMeta("userId")],
      resolveResult: new Map([["userId", "overridden-user"]]),
    });

    const result = await resolveContextVariables({
      seeds: new Map([["userId", "original-user"]]),
      providers: [provider],
      drizzle: mockDrizzle,
    });

    expect(result.get("userId")).toBe("overridden-user");
  });
});
