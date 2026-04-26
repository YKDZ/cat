import type { ObjectType, Relation } from "@cat/shared";

import { useQuery, type DataState } from "@pinia/colada";
import { computed, type ComputedRef } from "vue";

import { orpc } from "@/rpc/orpc";

/**
 * 检查当前用户对指定资源是否具有某种权限关系。
 * 使用 Pinia Colada 缓存，避免重复请求。
 * 缓存 key: ["perm", objectType, objectId, relation]
 */
export const usePermission = (
  objectType: ObjectType,
  objectId: string,
  relation: Relation,
): {
  allowed: ComputedRef<boolean>;
  loading: ComputedRef<boolean>;
  state: ComputedRef<DataState<boolean, Error>>;
} => {
  const { state } = useQuery({
    key: ["perm", objectType, objectId, relation],
    query: async () =>
      orpc.permission.check({
        objectType,
        objectId,
        relation,
      }),
    placeholderData: false,
    staleTime: 30_000,
    enabled: !import.meta.env.SSR && objectId.length > 0,
  });

  const allowed = computed(
    () => state.value.status === "success" && state.value.data,
  );
  const loading = computed(() => state.value.status === "pending");

  return { allowed, loading, state };
};
