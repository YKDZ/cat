import { describe, expect, it, vi } from "vitest";

import type { PermissionEngine } from "@/engine";
import type { AuthContext, ObjectRef } from "@/types";

import { determineWriteMode } from "@/trust-isolation";

// ─── Helpers ───────────────────────────────────────────────────────────────

const makeAuthCtx = (subjectId = "user-1"): AuthContext => ({
  subjectType: "user",
  subjectId,
  systemRoles: [],
  scopes: null,
});

/**
 * Build a mock PermissionEngine whose `check()` returns truthy only for the
 * relations listed in `grantedRelations`.
 */
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

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("determineWriteMode", () => {
  const PROJECT_ID = "project-abc";

  it("returns 'no_access' when subject has no editor relation", async () => {
    const engine = makeEngine([]); // no permissions at all
    const result = await determineWriteMode(engine, makeAuthCtx(), PROJECT_ID);
    expect(result).toBe("no_access");
  });

  it("returns 'no_access' when subject has only viewer relation", async () => {
    const engine = makeEngine(["viewer"]);
    const result = await determineWriteMode(engine, makeAuthCtx(), PROJECT_ID);
    expect(result).toBe("no_access");
  });

  it("returns 'direct' when subject has editor + direct_editor, no isolation_forced", async () => {
    const engine = makeEngine(["editor", "direct_editor"]);
    const result = await determineWriteMode(engine, makeAuthCtx(), PROJECT_ID);
    expect(result).toBe("direct");
  });

  it("returns 'isolation' when subject has editor but no direct_editor", async () => {
    const engine = makeEngine(["editor"]);
    const result = await determineWriteMode(engine, makeAuthCtx(), PROJECT_ID);
    expect(result).toBe("isolation");
  });

  it("returns 'isolation' when subject has direct_editor but also isolation_forced", async () => {
    const engine = makeEngine(["editor", "direct_editor", "isolation_forced"]);
    const result = await determineWriteMode(engine, makeAuthCtx(), PROJECT_ID);
    expect(result).toBe("isolation");
  });

  it("returns 'isolation' when only isolation_forced is set (no direct_editor)", async () => {
    const engine = makeEngine(["editor", "isolation_forced"]);
    const result = await determineWriteMode(engine, makeAuthCtx(), PROJECT_ID);
    expect(result).toBe("isolation");
  });

  it("passes the correct projectId as object ref to engine.check", async () => {
    const engine = makeEngine(["editor", "direct_editor"]);
    await determineWriteMode(engine, makeAuthCtx(), PROJECT_ID);
    expect(engine.check).toHaveBeenCalledWith(
      expect.any(Object),
      { type: "project", id: PROJECT_ID },
      "editor",
    );
  });

  it("short-circuits after the first check when there is no editor access", async () => {
    const engine = makeEngine([]);
    await determineWriteMode(engine, makeAuthCtx(), PROJECT_ID);
    // Only the initial 'editor' check should have been made
    expect(engine.check).toHaveBeenCalledTimes(1);
  });
});
