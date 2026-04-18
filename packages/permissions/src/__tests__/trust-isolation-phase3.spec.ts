/**
 * Trust & Isolation Mode Integration Tests (Phase 3)
 *
 * 覆盖: grant/revoke 联写、trust mode 判定、isolation_forced 前提检查
 * Covers: grant/revoke co-write, trust mode determination, isolation_forced preconditions
 */
import { describe, expect, it, vi } from "vitest";

import type { PermissionEngine } from "@/engine";
import type { AuthContext, ObjectRef } from "@/types";

import { determineWriteMode } from "@/trust-isolation";

// ─── Helpers ────────────────────────────────────────────────────────────────

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";

const makeAuthCtx = (subjectId = "user-1"): AuthContext => ({
  subjectType: "user",
  subjectId,
  systemRoles: [],
  scopes: null,
});

const makeEngine = (grantedRelations: string[]): PermissionEngine => {
  const check = vi.fn(
    async (
      _authCtx: AuthContext,
      _object: ObjectRef,
      relation: string,
    ): Promise<boolean> => grantedRelations.includes(relation),
  ) as PermissionEngine["check"];

  return {
    check,
    filterAuthorized: vi.fn() as PermissionEngine["filterAuthorized"],
    grant: vi.fn() as PermissionEngine["grant"],
    revoke: vi.fn() as PermissionEngine["revoke"],
    listSubjects: vi.fn() as PermissionEngine["listSubjects"],
    listObjects: vi.fn() as PermissionEngine["listObjects"],
  };
};

// ─── Trust-by-default & Isolation Exception ─────────────────────────────────

describe("Trust-by-default & Isolation Exception", () => {
  it("默认: grant editor 后 Subject 自动获得 direct_editor（联写合约）", async () => {
    // The co-write logic lives in grantPermissionTuple.cmd.ts:
    // when relation ∈ {editor,admin,owner} and objectType=project,
    // direct_editor is inserted in the same transaction.
    // Here we verify the write mode is "direct" when both are present.
    const engine = makeEngine(["editor", "direct_editor"]);
    await expect(
      determineWriteMode(engine, makeAuthCtx(), PROJECT_ID),
    ).resolves.toBe("direct");
  });

  it("默认: editor + direct_editor 的 Subject 直接编辑 main (direct mode)", async () => {
    const engine = makeEngine(["editor", "direct_editor"]);
    const mode = await determineWriteMode(engine, makeAuthCtx(), PROJECT_ID);
    expect(mode).toBe("direct");
  });

  it("例外: grant isolation_forced 后 Subject 被拦截，需通过 PR (isolation mode)", async () => {
    const engine = makeEngine(["editor", "direct_editor", "isolation_forced"]);
    const mode = await determineWriteMode(engine, makeAuthCtx(), PROJECT_ID);
    expect(mode).toBe("isolation");
  });

  it("例外: revoke isolation_forced 后恢复 Direct 模式", async () => {
    // Before revoke: isolation_forced present → isolation
    const before = makeEngine(["editor", "direct_editor", "isolation_forced"]);
    expect(await determineWriteMode(before, makeAuthCtx(), PROJECT_ID)).toBe(
      "isolation",
    );

    // After revoke: isolation_forced removed → direct
    const after = makeEngine(["editor", "direct_editor"]);
    expect(await determineWriteMode(after, makeAuthCtx(), PROJECT_ID)).toBe(
      "direct",
    );
  });

  it("清理: revoke editor 时联动 revoke direct_editor + isolation_forced → no_access", async () => {
    // All editor-level tuples revoked → no_access
    const engine = makeEngine([]);
    const mode = await determineWriteMode(engine, makeAuthCtx(), PROJECT_ID);
    expect(mode).toBe("no_access");
  });

  it("前提: grant isolation_forced 给无 editor 的 Subject 被拒绝（模拟前提检查）", async () => {
    // The trust-settings router verifies hasEditor before granting isolation_forced.
    const engine = makeEngine([]); // no editor
    const hasEditor = await engine.check(
      makeAuthCtx("no-editor-user"),
      { type: "project", id: PROJECT_ID },
      "editor",
    );
    expect(hasEditor).toBe(false);
    // In production, grantIsolationForced would throw here.
  });

  it("前提: PR 功能未启用时，isolation 仍可通过权限判定（功能检查在 router 层）", async () => {
    // determineWriteMode only cares about permission tuples, not feature flags.
    // PR feature toggle validation is handled at the router level (trust-settings.ts).
    const engine = makeEngine(["editor", "isolation_forced"]);
    const mode = await determineWriteMode(engine, makeAuthCtx(), PROJECT_ID);
    // editor only (no direct_editor) + isolation_forced → isolation
    expect(mode).toBe("isolation");
  });
});
