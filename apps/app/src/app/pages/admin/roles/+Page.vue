<script setup lang="ts">
import type { Relation } from "@cat/shared";

import {
  Badge,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cat/ui";
import { useQuery, useQueryCache } from "@pinia/colada";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/app/rpc/orpc";

const { t } = useI18n();
const queryCache = useQueryCache();

// System roles are stored as permissions on "system:*"
const { state: rolesState, refetch } = useQuery({
  key: ["permission.listSubjects", "system", "*"],
  query: () =>
    orpc.permission.listSubjects({
      objectType: "system",
      objectId: "*",
    }),
  enabled: !import.meta.env.SSR,
});

// Add user role form
const newUserId = ref("");
const newRelation = ref<Relation>("viewer");
const addLoading = ref(false);

// Allowed system relations
const systemRelations: Relation[] = ["superadmin", "admin", "viewer"];

const handleAddRole = async () => {
  if (!newUserId.value) return;
  addLoading.value = true;
  try {
    await orpc.permission.grant({
      subjectType: "user",
      subjectId: newUserId.value,
      relation: newRelation.value,
      objectType: "system",
      objectId: "*",
    });
    newUserId.value = "";
    void queryCache.invalidateQueries({ key: ["permission.listSubjects"] });
    void refetch();
  } finally {
    addLoading.value = false;
  }
};

const handleRemoveRole = async (subjectId: string, relation: Relation) => {
  await orpc.permission.revoke({
    subjectType: "user",
    subjectId,
    relation,
    objectType: "system",
    objectId: "*",
  });
  void refetch();
};
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-2xl font-bold">{{ t("角色管理") }}</h1>
    <p class="text-sm text-muted-foreground">
      {{ t("管理用户的系统级角色。系统角色对应于 system:* 上的权限关系。") }}
    </p>

    <!-- User System Roles Table -->
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{{ t("主体类型") }}</TableHead>
          <TableHead>{{ t("用户 / 主体 ID") }}</TableHead>
          <TableHead>{{ t("系统角色") }}</TableHead>
          <TableHead>{{ t("操作") }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="rolesState.status === 'pending'">
          <TableCell colspan="4" class="text-center text-muted-foreground">{{
            t("加载中...")
          }}</TableCell>
        </TableRow>
        <TableRow v-else-if="!rolesState.data?.length">
          <TableCell colspan="4" class="text-center text-muted-foreground">{{
            t("暂无系统角色")
          }}</TableCell>
        </TableRow>
        <TableRow
          v-for="row in rolesState.data"
          :key="`${row.type}:${row.id}:${row.relation}`"
        >
          <TableCell>{{ row.type }}</TableCell>
          <TableCell class="font-mono text-sm">{{ row.id }}</TableCell>
          <TableCell>
            <Badge>{{ row.relation }}</Badge>
          </TableCell>
          <TableCell>
            <Button
              variant="destructive"
              size="sm"
              @click="handleRemoveRole(row.id, row.relation)"
            >
              {{ t("移除") }}
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <!-- Add Role Form -->
    <div class="rounded-lg border p-4">
      <h2 class="mb-3 text-lg font-semibold">{{ t("添加系统角色") }}</h2>
      <div class="flex flex-wrap items-end gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">{{ t("用户 ID") }}</label>
          <Input
            v-model="newUserId"
            class="w-64"
            :placeholder="t('输入用户 UUID')"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">{{ t("角色") }}</label>
          <select
            v-model="newRelation"
            class="rounded border px-2 py-1 text-sm"
          >
            <option v-for="r in systemRelations" :key="r" :value="r">
              {{ r }}
            </option>
          </select>
        </div>
        <Button :disabled="addLoading || !newUserId" @click="handleAddRole">
          {{ t("添加") }}
        </Button>
      </div>
    </div>
  </div>
</template>
