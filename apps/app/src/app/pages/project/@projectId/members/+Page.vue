<script setup lang="ts">
import type { Relation } from "@cat/shared/schema/permission";

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
import { inject, ref } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/app/rpc/orpc";
import { useInjectionKey } from "@/app/utils/provide.ts";

import type { Data } from "../+data.server.ts";

const { t } = useI18n();
const queryCache = useQueryCache();
const project = inject(useInjectionKey<Data>()("project"))!;


const { state: membersState, refetch } = useQuery({
  key: ["permission.listSubjects", "project", project.id],
  query: () =>
    orpc.permission.listSubjects({
      objectType: "project",
      objectId: project.id,
    }),
  enabled: !import.meta.env.SSR,
});


// Add member form
const newUserId = ref("");
const newRelation = ref<Relation>("viewer");
const addLoading = ref(false);


const projectRelations: Relation[] = ["owner", "admin", "editor", "viewer"];


const handleAddMember = async () => {
  if (!newUserId.value) return;
  addLoading.value = true;
  try {
    await orpc.permission.grant({
      subjectType: "user",
      subjectId: newUserId.value,
      relation: newRelation.value,
      objectType: "project",
      objectId: project.id,
    });
    newUserId.value = "";
    void queryCache.invalidateQueries({ key: ["permission.listSubjects"] });
    void refetch();
  } finally {
    addLoading.value = false;
  }
};


const handleRemoveMember = async (subjectId: string, relation: Relation) => {
  await orpc.permission.revoke({
    subjectType: "user",
    subjectId,
    relation,
    objectType: "project",
    objectId: project.id,
  });
  void refetch();
};
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-2xl font-bold">{{ t("项目成员") }}</h1>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{{ t("主体类型") }}</TableHead>
          <TableHead>{{ t("用户 ID") }}</TableHead>
          <TableHead>{{ t("权限") }}</TableHead>
          <TableHead>{{ t("操作") }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="membersState.status === 'pending'">
          <TableCell colspan="4" class="text-center text-muted-foreground">{{
            t("加载中...")
          }}</TableCell>
        </TableRow>
        <TableRow v-else-if="!membersState.data?.length">
          <TableCell colspan="4" class="text-center text-muted-foreground">{{
            t("暂无成员")
          }}</TableCell>
        </TableRow>
        <TableRow
          v-for="row in membersState.data"
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
              @click="handleRemoveMember(row.id, row.relation)"
            >
              {{ t("移除") }}
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <!-- Add Member Form -->
    <div class="rounded-lg border p-4">
      <h2 class="mb-3 text-lg font-semibold">{{ t("添加成员") }}</h2>
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
          <label class="text-sm font-medium">{{ t("权限级别") }}</label>
          <select
            v-model="newRelation"
            class="rounded border px-2 py-1 text-sm"
          >
            <option v-for="r in projectRelations" :key="r" :value="r">
              {{ r }}
            </option>
          </select>
        </div>
        <Button :disabled="addLoading || !newUserId" @click="handleAddMember">
          {{ t("添加") }}
        </Button>
      </div>
    </div>
  </div>
</template>
