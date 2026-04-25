import type { AuthContext } from "@cat/permissions";

import { getPermissionEngine } from "@cat/permissions";
import { SubjectTypeSchema } from "@cat/shared";
import * as z from "zod";

import { authed, checkPermission } from "@/orpc/server";

const TrustSubjectSchema = z.object({
  projectId: z.uuid(),
  subjectType: SubjectTypeSchema,
  subjectId: z.string().min(1),
});

/**
 * Grant isolation_forced to a Subject in a project.
 * Requires project admin permission.
 */
export const grantIsolationForced = authed
  .input(TrustSubjectSchema)
  .use(checkPermission("project", "admin"), (i) => i.projectId)
  .output(z.void())
  .handler(async ({ input }) => {
    const engine = getPermissionEngine();
    // Verify the subject has at least editor access before granting isolation_forced
    const hasEditor = await engine.check(
      {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        systemRoles: [],
        scopes: null,
      },
      { type: "project", id: input.projectId },
      "editor",
    );
    if (!hasEditor) {
      throw new Error(
        "Subject must have editor permission before granting isolation_forced",
      );
    }
    await engine.grant(
      { type: input.subjectType, id: input.subjectId },
      "isolation_forced",
      { type: "project", id: input.projectId },
    );
  });

/**
 * Revoke isolation_forced from a Subject in a project.
 * Requires project admin permission.
 */
export const revokeIsolationForced = authed
  .input(TrustSubjectSchema)
  .use(checkPermission("project", "admin"), (i) => i.projectId)
  .output(z.void())
  .handler(async ({ input }) => {
    const engine = getPermissionEngine();
    await engine.revoke(
      { type: input.subjectType, id: input.subjectId },
      "isolation_forced",
      { type: "project", id: input.projectId },
    );
  });

/**
 * List all subjects' trust/isolation status for a project.
 * Requires project admin permission.
 */
export const listTrustStatus = authed
  .input(z.object({ projectId: z.uuid() }))
  .use(checkPermission("project", "admin"), (i) => i.projectId)
  .output(
    z.array(
      z.object({
        subjectType: SubjectTypeSchema,
        subjectId: z.string(),
        hasDirectEditor: z.boolean(),
        hasIsolationForced: z.boolean(),
        trustMode: z.enum(["direct", "isolation"]),
      }),
    ),
  )
  .handler(async ({ input }) => {
    const engine = getPermissionEngine();
    const projectRef = { type: "project" as const, id: input.projectId };

    // Get all subjects with editor or higher
    const editorSubjects = await engine.listSubjects(projectRef, "editor");

    const results = await Promise.all(
      editorSubjects.map(async (subject) => {
        const authCtx: AuthContext = {
          subjectType: subject.type,
          subjectId: subject.id,
          systemRoles: [],
          scopes: null,
        };
        const [hasDirectEditor, hasIsolationForced] = await Promise.all([
          engine.check(authCtx, projectRef, "direct_editor"),
          engine.check(authCtx, projectRef, "isolation_forced"),
        ]);

        const trustMode: "direct" | "isolation" =
          hasDirectEditor && !hasIsolationForced ? "direct" : "isolation";

        return {
          subjectType: subject.type,
          subjectId: subject.id,
          hasDirectEditor,
          hasIsolationForced,
          trustMode,
        };
      }),
    );

    return results;
  });
