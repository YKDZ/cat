import type { PermissionEngine } from "./engine.ts";
import type { AuthContext, ObjectRef } from "./types.ts";

/**
 * 判定 Subject 对 Project 的 Trust/Isolation 模式。
 *
 * Determine the trust/isolation mode for a subject on a project.
 *
 * @returns "trust" | "isolation" | "no_access"
 */
export async function determineTrustMode(
  engine: PermissionEngine,
  authCtx: AuthContext,
  projectId: string,
): Promise<"trust" | "isolation" | "no_access"> {
  const projectRef: ObjectRef = { type: "project", id: projectId };

  // 第一层: 是否可修改（editor 或以上）
  const hasEditor = await engine.check(authCtx, projectRef, "editor");
  if (!hasEditor) return "no_access";

  // 第二层: 如何修改
  const hasDirectEditor = await engine.check(
    authCtx,
    projectRef,
    "direct_editor",
  );
  const hasIsolationForced = await engine.check(
    authCtx,
    projectRef,
    "isolation_forced",
  );

  if (hasDirectEditor && !hasIsolationForced) return "trust";
  return "isolation";
}
