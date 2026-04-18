import type { PermissionEngine } from "./engine.ts";
import type { AuthContext, ObjectRef } from "./types.ts";

/**
 * @zh 判定 Subject 对 Project 的写入模式（Direct / Isolation）。
 * @en Determine the write mode (Direct / Isolation) for a subject on a project.
 *
 * @returns "direct" | "isolation" | "no_access"
 */
export async function determineWriteMode(
  engine: PermissionEngine,
  authCtx: AuthContext,
  projectId: string,
): Promise<"direct" | "isolation" | "no_access"> {
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

  if (hasDirectEditor && !hasIsolationForced) return "direct";
  return "isolation";
}
