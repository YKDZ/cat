<script setup lang="ts">
import type { ObjectType, Relation } from "@cat/shared/schema/permission";
import type { SubjectType } from "@cat/shared/schema/permission";

import {
  ObjectTypeSchema,
  RelationSchema,
  SubjectTypeSchema,
} from "@cat/shared/schema/permission";
import {
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

const filterObjectType = ref<ObjectType>("system");
const filterObjectId = ref("*");
const filterRelation = ref<Relation | "">("");

const { state: subjectsState, refetch } = useQuery({
  key: [
    "permission.listSubjects",
    filterObjectType,
    filterObjectId,
    filterRelation,
  ],
  query: () =>
    orpc.permission.listSubjects({
      objectType: filterObjectType.value,
      objectId: filterObjectId.value,
      relation: filterRelation.value || undefined,
    }),
  enabled: !import.meta.env.SSR,
});

// Grant form
const grantSubjectType = ref<SubjectType>("user");
const grantSubjectId = ref("");
const grantRelation = ref<Relation>("viewer");
const grantObjectType = ref<ObjectType>("system");
const grantObjectId = ref("*");
const grantLoading = ref(false);

const handleGrant = async () => {
  if (!grantSubjectId.value) return;
  grantLoading.value = true;
  try {
    await orpc.permission.grant({
      subjectType: grantSubjectType.value,
      subjectId: grantSubjectId.value,
      relation: grantRelation.value,
      objectType: grantObjectType.value,
      objectId: grantObjectId.value,
    });
    grantSubjectId.value = "";
    void queryCache.invalidateQueries({ key: ["permission.listSubjects"] });
    void refetch();
  } finally {
    grantLoading.value = false;
  }
};

const handleRevoke = async (
  subjectType: SubjectType,
  subjectId: string,
  relation: Relation,
) => {
  await orpc.permission.revoke({
    subjectType,
    subjectId,
    relation,
    objectType: filterObjectType.value,
    objectId: filterObjectId.value,
  });
  void refetch();
};

const objectTypes = ObjectTypeSchema.options ?? [];
const relations = RelationSchema.options ?? [];
const subjectTypes = SubjectTypeSchema.options ?? [];
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-2xl font-bold">{{ t("权限管理") }}</h1>

    <!-- Filter -->
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">{{ t("资源类型") }}</label>
        <select
          v-model="filterObjectType"
          class="rounded border px-2 py-1 text-sm"
        >
          <option v-for="ot in objectTypes" :key="ot" :value="ot">
            {{ ot }}
          </option>
        </select>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">{{ t("资源 ID") }}</label>
        <Input v-model="filterObjectId" class="w-60" placeholder="*" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">{{ t("关系") }}</label>
        <select
          v-model="filterRelation"
          class="rounded border px-2 py-1 text-sm"
        >
          <option value="">{{ t("全部") }}</option>
          <option v-for="r in relations" :key="r" :value="r">{{ r }}</option>
        </select>
      </div>
    </div>

    <!-- Results Table -->
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{{ t("主体类型") }}</TableHead>
          <TableHead>{{ t("主体 ID") }}</TableHead>
          <TableHead>{{ t("关系") }}</TableHead>
          <TableHead>{{ t("操作") }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="subjectsState.status === 'pending'">
          <TableCell colspan="4" class="text-center text-muted-foreground">{{
            t("加载中...")
          }}</TableCell>
        </TableRow>
        <TableRow v-else-if="!subjectsState.data?.length">
          <TableCell colspan="4" class="text-center text-muted-foreground">{{
            t("暂无数据")
          }}</TableCell>
        </TableRow>
        <TableRow
          v-for="row in subjectsState.data"
          :key="`${row.type}:${row.id}:${row.relation}`"
        >
          <TableCell>{{ row.type }}</TableCell>
          <TableCell class="font-mono text-sm">{{ row.id }}</TableCell>
          <TableCell>
            <span class="rounded bg-muted px-2 py-0.5 text-xs">{{
              row.relation
            }}</span>
          </TableCell>
          <TableCell>
            <Button
              variant="destructive"
              size="sm"
              @click="handleRevoke(row.type, row.id, row.relation)"
            >
              {{ t("撤销") }}
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <!-- Grant Form -->
    <div class="rounded-lg border p-4">
      <h2 class="mb-3 text-lg font-semibold">{{ t("授予权限") }}</h2>
      <div class="flex flex-wrap items-end gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">{{ t("主体类型") }}</label>
          <select
            v-model="grantSubjectType"
            class="rounded border px-2 py-1 text-sm"
          >
            <option v-for="st in subjectTypes" :key="st" :value="st">
              {{ st }}
            </option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">{{ t("主体 ID") }}</label>
          <Input
            v-model="grantSubjectId"
            class="w-60"
            :placeholder="t('用户 ID 等')"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">{{ t("关系") }}</label>
          <select
            v-model="grantRelation"
            class="rounded border px-2 py-1 text-sm"
          >
            <option v-for="r in relations" :key="r" :value="r">{{ r }}</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">{{ t("资源类型") }}</label>
          <select
            v-model="grantObjectType"
            class="rounded border px-2 py-1 text-sm"
          >
            <option v-for="ot in objectTypes" :key="ot" :value="ot">
              {{ ot }}
            </option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">{{ t("资源 ID") }}</label>
          <Input v-model="grantObjectId" class="w-40" placeholder="*" />
        </div>
        <Button
          :disabled="grantLoading || !grantSubjectId"
          @click="handleGrant"
        >
          {{ t("授予") }}
        </Button>
      </div>
    </div>
  </div>
</template>
