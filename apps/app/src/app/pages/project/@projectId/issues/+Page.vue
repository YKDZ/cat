<script setup lang="ts">
import type { IssueStatus } from "@cat/shared";

import { Button } from "@cat/ui";
import { CircleDot, CircleCheck } from "@lucide/vue";
import { useQuery } from "@pinia/colada";
import { useDebounceFn } from "@vueuse/core";
import { useData } from "vike-vue/useData";
import { navigate } from "vike/client/router";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/app/rpc/orpc";

import type { Data } from "./+data.ts";

const { t } = useI18n();
const { projectId } = useData<Data>();

const PAGE_SIZE = 30;
const activeTab = ref<IssueStatus | "">("");
const searchQuery = ref("");
const page = ref(0);

const queryParams = computed(() => ({
  projectId,
  status: (activeTab.value || undefined) as IssueStatus | undefined,
  search: searchQuery.value || undefined,
  limit: PAGE_SIZE,
  offset: page.value * PAGE_SIZE,
}));

const { state } = useQuery({
  key: () => [
    "issues",
    projectId,
    activeTab.value,
    searchQuery.value,
    page.value,
  ],
  query: () => orpc.issue.listProjectIssues(queryParams.value),
  placeholderData: [],
  enabled: !import.meta.env.SSR,
});

const issues = computed(() => state.value.data ?? []);
const hasMore = computed(() => issues.value.length >= PAGE_SIZE);

const setTab = (tab: IssueStatus | "") => {
  activeTab.value = tab;
  page.value = 0;
};

const debouncedSearch = useDebounceFn((val: string) => {
  searchQuery.value = val;
  page.value = 0;
}, 300);
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-semibold">{{ t("议题") }}</h1>
      <Button
        v-perm="{ object: 'project', id: projectId, relation: 'editor' }"
        @click="navigate(`/project/${projectId}/issues/new`)"
      >
        <div class="icon-[mdi--plus] size-4" />
        {{ t("新建议题") }}
      </Button>
    </div>

    <!-- Toolbar: Search + Tabs -->
    <div class="flex items-center gap-4">
      <input
        type="text"
        :placeholder="t('搜索议题...')"
        class="h-9 rounded-md border bg-background px-3 text-sm focus:ring-1 focus:ring-ring focus:outline-none"
        @input="debouncedSearch(($event.target as HTMLInputElement).value)"
      />
      <div class="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          :class="{ 'bg-accent': activeTab === '' }"
          @click="setTab('')"
        >
          {{ t("全部") }}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          :class="{ 'bg-accent': activeTab === 'OPEN' }"
          @click="setTab('OPEN')"
        >
          <CircleDot class="mr-1 size-3.5 text-green-600" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          :class="{ 'bg-accent': activeTab === 'CLOSED' }"
          @click="setTab('CLOSED')"
        >
          <CircleCheck class="mr-1 size-3.5 text-purple-600" />
        </Button>
      </div>
    </div>

    <!-- Loading -->
    <div
      v-if="state.status === 'pending'"
      class="py-8 text-center text-sm text-muted-foreground"
    >
      {{ t("加载中...") }}
    </div>

    <!-- Empty -->
    <div
      v-else-if="issues.length === 0"
      class="py-8 text-center text-sm text-muted-foreground"
    >
      {{ t("暂无议题") }}
    </div>

    <!-- List -->
    <ul v-else class="divide-y rounded-md border">
      <li
        v-for="issue in issues"
        :key="issue.id"
        class="px-4 py-3 hover:bg-accent"
      >
        <a
          :href="`/project/${projectId}/issues/${issue.number}`"
          class="flex items-start gap-3"
        >
          <CircleDot
            v-if="issue.status === 'OPEN'"
            class="mt-0.5 size-4 shrink-0 text-green-600"
          />
          <CircleCheck v-else class="mt-0.5 size-4 shrink-0 text-purple-600" />
          <div class="min-w-0 flex-1">
            <span class="font-medium">{{ issue.title }}</span>
            <p class="text-xs text-muted-foreground">
              {{
                t("#{id} · 创建于 {date}", {
                  id: issue.number,
                  date: new Date(issue.createdAt).toLocaleDateString("zh-CN"),
                })
              }}
            </p>
          </div>
        </a>
      </li>
    </ul>

    <!-- Pagination -->
    <div v-if="issues.length > 0" class="flex items-center justify-between">
      <Button
        variant="outline"
        size="sm"
        :disabled="page === 0"
        @click="page -= 1"
      >
        {{ t("上一页") }}
      </Button>
      <span class="text-xs text-muted-foreground">
        {{ t("第 {n} 页", { n: page + 1 }) }}
      </span>
      <Button
        variant="outline"
        size="sm"
        :disabled="!hasMore"
        @click="page += 1"
      >
        {{ t("下一页") }}
      </Button>
    </div>
  </div>
</template>
