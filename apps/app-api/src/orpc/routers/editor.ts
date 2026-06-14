import {
  countEditorScopeElements,
  executeQuery,
  getBranchById,
  getEditorScopeElementPageIndex,
  getEditorScopeFirstElement,
  listEditorScopeContentNodes,
  listEditorScopeElements,
  type ProjectContentNodeRow,
} from "@cat/domain";
import {
  EditorContentNodeFilterSchema,
  type EditorContentNodeFilter,
  EditorElementPageIndexQuerySchema,
  type EditorScope,
  EditorElementQuerySchema,
  EditorElementSchema,
  EditorFirstElementQuerySchema,
  EditorScopeSchema,
  EditorScopeViewSchema,
} from "@cat/shared";
import { ORPCError } from "@orpc/client";
import * as z from "zod";

import { authed, checkPermission } from "@/orpc/server";

type ProjectContentNode = ProjectContentNodeRow;

type ResolvedEditorScope = EditorScope & {
  combinationMode: "UNION";
  contentNodeFilters: EditorContentNodeFilter[];
  invalidContentNodeIds: string[];
};

type EditorRouterContext = {
  helpers: { getReqHeader(name: string): string | undefined };
};

const buildPath = (
  node: ProjectContentNode,
  byId: Map<string, ProjectContentNode>,
) => {
  const path = [];
  let cursor: ProjectContentNode | undefined = node;
  const seen = new Set<string>();

  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    path.unshift({
      id: cursor.id,
      label: cursor.displayLabel,
      kind: cursor.kind,
    });
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }

  return path;
};

const resolveScopeView = async (
  drizzle: Parameters<typeof executeQuery>[0]["db"],
  scope: EditorScope,
) => {
  const nodes = await executeQuery(
    { db: drizzle },
    listEditorScopeContentNodes,
    {
      projectId: scope.projectId,
      branchId: scope.branchId,
    },
  );
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const validIds = new Set(nodes.map((node) => node.id));
  const dedupedIds = [...new Set(scope.contentNodeIds)];
  const validFilterIds = dedupedIds.filter((id) => validIds.has(id));
  const invalidContentNodeIds = dedupedIds.filter((id) => !validIds.has(id));

  const contentNodeFilters: EditorContentNodeFilter[] = validFilterIds.map(
    (id) => {
      const node = byId.get(id)!;
      return {
        id: node.id,
        label: node.displayLabel,
        kind: node.kind,
        boundaryType: node.boundaryType,
        exportRole: node.exportRole,
        includeDescendants: true,
        parentId: node.parentId,
        path: buildPath(node, byId),
      };
    },
  );

  return {
    ...scope,
    combinationMode: "UNION",
    contentNodeIds: validFilterIds,
    contentNodeFilters,
    invalidContentNodeIds,
  } satisfies ResolvedEditorScope;
};

const validateStatusScope = (input: Pick<EditorScope, "languageToId">) => {
  if (!input.languageToId) {
    throw new ORPCError("BAD_REQUEST", {
      message: "languageToId is required for editor status queries",
    });
  }
};

const parseHeaderBranchId = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const resolveEditorBranchId = async (
  context: EditorRouterContext,
  db: Parameters<typeof executeQuery>[0]["db"],
  input: Pick<EditorScope, "projectId" | "branchId">,
): Promise<number | undefined> => {
  const branchId =
    input.branchId ??
    parseHeaderBranchId(context.helpers.getReqHeader("x-branch-id"));
  if (branchId === undefined) return undefined;

  const branch = await executeQuery({ db }, getBranchById, { branchId });
  if (!branch) {
    throw new ORPCError("NOT_FOUND", {
      message: `Branch ${branchId} not found`,
    });
  }
  if (branch.status !== "ACTIVE") {
    throw new ORPCError("CONFLICT", {
      message: `Branch ${branchId} is not ACTIVE (status: ${branch.status})`,
    });
  }
  if (branch.projectId !== input.projectId) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Branch ${branchId} does not belong to project ${input.projectId}`,
    });
  }

  return branchId;
};

/**
 * Resolve and sanitize an editor scope into a server-ready scope view.
 */
export const resolveScope = authed
  .input(EditorScopeSchema)
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
  .output(EditorScopeViewSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const branchId = await resolveEditorBranchId(context, drizzle, input);
    return EditorScopeViewSchema.parse(
      await resolveScopeView(drizzle, { ...input, branchId }),
    );
  });

/**
 * List selectable content-node filters for an editor scope.
 */
export const listContentNodes = authed
  .input(EditorScopeSchema.pick({ projectId: true, branchId: true }))
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
  .output(z.array(EditorContentNodeFilterSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const branchId = await resolveEditorBranchId(context, drizzle, input);
    const nodes = await executeQuery(
      { db: drizzle },
      listEditorScopeContentNodes,
      { projectId: input.projectId, branchId },
    );
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return nodes
      .filter((node) => node.kind !== "PROJECT_ROOT")
      .map((node) =>
        EditorContentNodeFilterSchema.parse({
          id: node.id,
          label: node.displayLabel,
          kind: node.kind,
          boundaryType: node.boundaryType,
          exportRole: node.exportRole,
          includeDescendants: true,
          parentId: node.parentId,
          path: buildPath(node, byId),
        }),
      );
  });

/**
 * Count elements matching filters inside an editor scope.
 */
export const countElements = authed
  .input(EditorElementQuerySchema.omit({ page: true, pageSize: true }))
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
  .output(z.int().min(0))
  .handler(async ({ context, input }) => {
    validateStatusScope(input);
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const branchId = await resolveEditorBranchId(context, drizzle, input);
    const scope = await resolveScopeView(
      drizzle,
      EditorScopeSchema.parse({ ...input, branchId }),
    );
    return await executeQuery({ db: drizzle }, countEditorScopeElements, scope);
  });

/**
 * List elements under the given editor scope.
 */
export const listElements = authed
  .input(EditorElementQuerySchema)
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
  .output(z.array(EditorElementSchema))
  .handler(async ({ context, input }) => {
    validateStatusScope(input);
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const branchId = await resolveEditorBranchId(context, drizzle, input);
    const scope = await resolveScopeView(drizzle, { ...input, branchId });
    return await executeQuery({ db: drizzle }, listEditorScopeElements, scope);
  });

/**
 * Get the first matching element in scope, or the first one after a given element.
 */
export const getFirstElement = authed
  .input(EditorFirstElementQuerySchema)
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
  .output(EditorElementSchema.nullable())
  .handler(async ({ context, input }) => {
    validateStatusScope(input);
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const branchId = await resolveEditorBranchId(context, drizzle, input);
    const scope = await resolveScopeView(
      drizzle,
      EditorScopeSchema.parse({ ...input, branchId, page: 1 }),
    );
    return await executeQuery({ db: drizzle }, getEditorScopeFirstElement, {
      ...scope,
      afterElementId: input.afterElementId,
    });
  });

/**
 * Get the zero-based page index of an element inside the editor scope; returns `null` when the element is out of scope.
 */
export const getElementPageIndex = authed
  .input(EditorElementPageIndexQuerySchema)
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
  .output(z.int().min(0).nullable())
  .handler(async ({ context, input }) => {
    validateStatusScope(input);
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const branchId = await resolveEditorBranchId(context, drizzle, input);
    const scope = await resolveScopeView(
      drizzle,
      EditorScopeSchema.parse({ ...input, branchId, page: 1 }),
    );
    return await executeQuery({ db: drizzle }, getEditorScopeElementPageIndex, {
      ...scope,
      elementId: input.elementId,
      pageSize: input.pageSize,
    });
  });
