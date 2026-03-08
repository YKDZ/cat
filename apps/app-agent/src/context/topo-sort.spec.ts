import { describe, expect, it } from "vitest";

import { CircularDependencyError, topoSortProviders } from "./topo-sort.ts";

// ─── Helpers ───

type ProviderShape = {
  provides: ReadonlyArray<{ key: string }>;
  dependencies: ReadonlyArray<{ key: string; optional: boolean }>;
};

const makeProvider = (
  provides: string[],
  deps: Array<{ key: string; optional?: boolean }> = [],
): ProviderShape => ({
  provides: provides.map((key) => ({ key })),
  dependencies: deps.map(({ key, optional = false }) => ({ key, optional })),
});

// ─── Tests ───

describe("topoSortProviders", () => {
  // ── 基础情况 ──────────────────────────────────────────────────────────────

  it("空 provider 列表返回空分层", () => {
    expect(topoSortProviders([])).toEqual([]);
  });

  it("单个无依赖 provider 返回单层", () => {
    const layers = topoSortProviders([makeProvider(["a"])]);
    expect(layers).toEqual([[0]]);
  });

  it("多个互相独立的 provider 归入同一层", () => {
    const providers = [
      makeProvider(["a"]),
      makeProvider(["b"]),
      makeProvider(["c"]),
    ];
    const layers = topoSortProviders(providers);
    expect(layers).toHaveLength(1);
    expect(layers[0]).toHaveLength(3);
    expect(layers[0]).toContain(0);
    expect(layers[0]).toContain(1);
    expect(layers[0]).toContain(2);
  });

  // ── 依赖链 ────────────────────────────────────────────────────────────────

  it("线性依赖链分为多层（A → B → C）", () => {
    const providers = [
      makeProvider(["a"]), // idx 0
      makeProvider(["b"], [{ key: "a" }]), // idx 1 depends on 0
      makeProvider(["c"], [{ key: "b" }]), // idx 2 depends on 1
    ];
    const layers = topoSortProviders(providers);
    expect(layers).toHaveLength(3);
    expect(layers[0]).toEqual([0]);
    expect(layers[1]).toEqual([1]);
    expect(layers[2]).toEqual([2]);
  });

  it("菱形依赖（A, B → C, D 依赖 A、B）", () => {
    // 0: provides "x"
    // 1: provides "y"
    // 2: provides "z", depends on "x" and "y"
    const providers = [
      makeProvider(["x"]),
      makeProvider(["y"]),
      makeProvider(["z"], [{ key: "x" }, { key: "y" }]),
    ];
    const layers = topoSortProviders(providers);
    // layer 0 = [0, 1], layer 1 = [2]
    expect(layers).toHaveLength(2);
    expect(layers[0]).toContain(0);
    expect(layers[0]).toContain(1);
    expect(layers[1]).toEqual([2]);
  });

  // ── 种子变量依赖（不属于任何 provider 提供的键）────────────────────────────

  it("依赖种子变量（没有 provider 提供它）时 provider 仍然归入第 0 层", () => {
    // "userId" 是种子变量，不由任何 provider 提供
    const providers = [makeProvider(["profile"], [{ key: "userId" }])];
    const layers = topoSortProviders(providers);
    // 无法解析到任何 provider 提供 "userId"，所以入度 = 0，归到 layer 0
    expect(layers).toHaveLength(1);
    expect(layers[0]).toEqual([0]);
  });

  it("可选依赖缺失时 provider 归入第 0 层", () => {
    const providers = [
      makeProvider(["result"], [{ key: "maybeExists", optional: true }]),
    ];
    const layers = topoSortProviders(providers);
    expect(layers).toHaveLength(1);
    expect(layers[0]).toEqual([0]);
  });

  // ── 总层数覆盖所有 provider ───────────────────────────────────────────────

  it("所有 provider 都在分层结果中（扁平后=原始索引集合）", () => {
    const providers = [
      makeProvider(["a"]),
      makeProvider(["b"], [{ key: "a" }]),
      makeProvider(["c"]),
      makeProvider(["d"], [{ key: "c" }, { key: "b" }]),
    ];
    const layers = topoSortProviders(providers);
    const flat = layers.flat();
    expect(flat.sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  // ── 环路检测 ──────────────────────────────────────────────────────────────

  it("两节点互相依赖时抛出 CircularDependencyError", () => {
    const providers = [
      makeProvider(["a"], [{ key: "b" }]), // idx 0
      makeProvider(["b"], [{ key: "a" }]), // idx 1
    ];
    expect(() => topoSortProviders(providers)).toThrowError(
      CircularDependencyError,
    );
  });

  it("三节点环路时抛出 CircularDependencyError", () => {
    const providers = [
      makeProvider(["a"], [{ key: "c" }]),
      makeProvider(["b"], [{ key: "a" }]),
      makeProvider(["c"], [{ key: "b" }]),
    ];
    expect(() => topoSortProviders(providers)).toThrowError(
      CircularDependencyError,
    );
  });

  it("环路错误包含 cyclePath 字段", () => {
    const providers = [
      makeProvider(["ping"], [{ key: "pong" }]),
      makeProvider(["pong"], [{ key: "ping" }]),
    ];
    try {
      topoSortProviders(providers);
      expect.fail("应该抛出错误");
    } catch (err) {
      expect(err).toBeInstanceOf(CircularDependencyError);
      if (!(err instanceof CircularDependencyError))
        throw new Error("unexpected");
      expect(Array.isArray(err.cyclePath)).toBe(true);
      expect(err.cyclePath.length).toBeGreaterThan(0);
    }
  });

  it("自依赖抛出 CircularDependencyError", () => {
    const providers = [makeProvider(["self"], [{ key: "self" }])];
    expect(() => topoSortProviders(providers)).toThrowError(
      CircularDependencyError,
    );
  });

  // ── 错误消息可读性 ────────────────────────────────────────────────────────

  it("CircularDependencyError 的 message 包含 '→' 符号", () => {
    const providers = [
      makeProvider(["x"], [{ key: "y" }]),
      makeProvider(["y"], [{ key: "x" }]),
    ];
    try {
      topoSortProviders(providers);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      if (!(err instanceof Error)) throw new Error("unexpected");
      expect(err.message).toContain("→");
    }
  });

  it("CircularDependencyError 的 name 为 'CircularDependencyError'", () => {
    const providers = [
      makeProvider(["x"], [{ key: "y" }]),
      makeProvider(["y"], [{ key: "x" }]),
    ];
    try {
      topoSortProviders(providers);
    } catch (err) {
      expect(err).toBeInstanceOf(CircularDependencyError);
      if (!(err instanceof CircularDependencyError))
        throw new Error("unexpected");
      expect(err.name).toBe("CircularDependencyError");
    }
  });
});
