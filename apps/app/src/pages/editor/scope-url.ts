import {
  ElementSortModeSchema,
  EditorScopeSchema,
  EditorTranslationStatusFilterSchema,
  type EditorScope,
} from "@cat/shared";
import * as z from "zod";

/**
 * Target element token used in editor routes.
 */
export type EditorElementRouteTarget = number | "auto" | "empty";

const parsePositiveInt = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const parsePageSize = (value: string | null): number | undefined => {
  const parsed = parsePositiveInt(value);
  return parsed !== undefined && parsed <= 100 ? parsed : undefined;
};

const splitIds = (value: string | null): string[] =>
  value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];

const uuidSchema = z.uuidv4();

const parseContentNodeIds = (value: string | null): string[] =>
  splitIds(value).filter((id) => uuidSchema.safeParse(id).success);

const parseStatus = (value: string | null): EditorScope["statusFilter"] =>
  EditorTranslationStatusFilterSchema.safeParse(value).data ?? "all";

const parseSortMode = (value: string | null): EditorScope["sortMode"] =>
  ElementSortModeSchema.safeParse(value).data ?? "structure";

/**
 * Parse an editor scope from canonical editor route params and query params.
 *
 * @param input - Route input
 * @returns - Normalized editor scope
 */
export const parseEditorScopeFromRoute = (input: {
  projectId: unknown;
  languageToId: unknown;
  searchParams: URLSearchParams;
}): EditorScope => {
  const raw = {
    projectId: typeof input.projectId === "string" ? input.projectId : "",
    languageToId:
      typeof input.languageToId === "string" ? input.languageToId : "",
    branchId: parsePositiveInt(input.searchParams.get("branchId")),
    contentNodeIds: parseContentNodeIds(input.searchParams.get("nodes")),
    searchQuery: input.searchParams.get("q") ?? "",
    statusFilter: parseStatus(input.searchParams.get("status")),
    sortMode: parseSortMode(input.searchParams.get("sort")),
    page: parsePositiveInt(input.searchParams.get("page")) ?? 1,
    pageSize: parsePageSize(input.searchParams.get("pageSize")) ?? 16,
  };

  return EditorScopeSchema.parse(raw);
};

/**
 * Serialize an editor scope into URL search params.
 *
 * @param scope - Editor scope
 * @returns - Corresponding query params
 */
export const toEditorSearchParams = (scope: EditorScope): URLSearchParams => {
  const params = new URLSearchParams();

  if (scope.contentNodeIds.length > 0) {
    params.set("nodes", scope.contentNodeIds.join(","));
  }
  if (scope.searchQuery.trim().length > 0) {
    params.set("q", scope.searchQuery.trim());
  }
  if (scope.statusFilter !== "all") {
    params.set("status", scope.statusFilter);
  }
  if (scope.sortMode !== "structure") {
    params.set("sort", scope.sortMode);
  }
  if (scope.page !== 1) {
    params.set("page", String(scope.page));
  }
  if (scope.pageSize !== 16) {
    params.set("pageSize", String(scope.pageSize));
  }
  if (scope.branchId !== undefined) {
    params.set("branchId", String(scope.branchId));
  }

  return params;
};

/**
 * Build a canonical editor route href.
 *
 * @param scope - Editor scope
 * @param target - Target element token
 * @returns - Navigable editor href
 */
export const buildEditorHref = (
  scope: EditorScope,
  target: EditorElementRouteTarget,
): string => {
  const normalized = EditorScopeSchema.parse(scope);
  const params = toEditorSearchParams(normalized);
  const suffix = params.toString();
  const path = `/editor/project/${normalized.projectId}/${normalized.languageToId}/${target}`;

  return suffix ? `${path}?${suffix}` : path;
};
