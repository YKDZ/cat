/**
 * app-api 单元测试样板 — 展示以下模式：
 *
 * 1. `vi.mock('@cat/domain')` 激活 __mocks__/@cat/domain.ts，使 executeCommand /
 *    executeQuery 变成可断言的 vi.fn()
 * 2. `createTestContext` / `createAuthedTestContext` 快速构造 oRPC handler 上下文
 * 3. 通过 `vi.mocked()` 对执行器返回值进行精确控制
 *
 * 对于 oRPC handler 的实际调用，请使用 oRPC 的 `createRouterClient`（见集成测
 * 试目录 __tests__/integration/），此文件仅验证基础测试设施是否正常工作。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock 必须在所有 import 之前声明（Vitest 自动提升）
vi.mock("@cat/domain");

import { executeCommand, executeQuery } from "@cat/domain";
import { createAuthedTestContext, createTestContext } from "@cat/test-utils";

describe("createTestContext", () => {
  it("默认返回未认证上下文", () => {
    const ctx = createTestContext();

    expect(ctx.user).toBeNull();
    expect(ctx.sessionId).toBeNull();
  });

  it("helpers 存在且为可调用方法", () => {
    const ctx = createTestContext();

    expect(typeof ctx.helpers.getCookie).toBe("function");
    expect(ctx.helpers.getCookie("session")).toBeNull();
  });

  it("cacheStore / sessionStore 方法可无副作用调用", async () => {
    const ctx = createTestContext();

    await expect(ctx.cacheStore.get("key")).resolves.toBeNull();
    await expect(ctx.cacheStore.has("key")).resolves.toBe(false);
    await expect(ctx.sessionStore.getField("key", "field")).resolves.toBeNull();
  });

  it("overrides 可覆盖任意字段", () => {
    const ctx = createTestContext({ sessionId: "custom-session" });

    expect(ctx.sessionId).toBe("custom-session");
    expect(ctx.user).toBeNull(); // 未覆盖的字段保持默认
  });
});

describe("createAuthedTestContext", () => {
  it("返回有效的已认证用户和 sessionId", () => {
    const ctx = createAuthedTestContext();

    expect(ctx.user).not.toBeNull();
    expect(ctx.user?.email).toBe("test@example.com");
    expect(ctx.sessionId).toBe("test-session-id");
  });

  it("可覆盖 user 的部分字段", () => {
    const ctx = createAuthedTestContext({ email: "admin@example.com" });

    expect(ctx.user?.email).toBe("admin@example.com");
    expect(ctx.user?.name).toBe("Test User"); // 其余字段保持默认
  });
});

describe("@cat/domain mock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executeCommand は vi.fn() に置き換えられる", () => {
    expect(vi.isMockFunction(executeCommand)).toBe(true);
  });

  it("executeQuery は vi.fn() に置き換えられる", () => {
    expect(vi.isMockFunction(executeQuery)).toBe(true);
  });

  it("beforeEach で呼び出し履歴がリセットされる", () => {
    expect(vi.mocked(executeCommand)).not.toHaveBeenCalled();
    expect(vi.mocked(executeQuery)).not.toHaveBeenCalled();
  });

  /**
   * 実際の handler テストでは以下のパターンを使用する：
   *
   * ```ts
   * vi.mocked(executeCommand).mockResolvedValueOnce({ id: 'proj-1' })
   * const result = await handler.createProject({ name: 'test' }, { context: authedCtx })
   * expect(vi.mocked(executeCommand)).toHaveBeenCalledOnce()
   * expect(result.id).toBe('proj-1')
   * ```
   */
  it("mockResolvedValueOnce / mockResolvedValue パターンの確認", () => {
    vi.mocked(executeCommand).mockResolvedValue({ id: "queued" });
    // mock が設定されていることを検証（実際の呼び出しは handler テストで行う）
    expect(vi.mocked(executeCommand).mock.invocationCallOrder).toHaveLength(0);
  });
});
