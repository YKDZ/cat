<script setup lang="ts">
import type { PullRequestStatus } from "@cat/shared/schema/enum";

import { Badge, Button } from "@cat/ui";
import { Bot, CircleDot, CircleCheck, GitMerge } from "@lucide/vue";
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
const activeTab = ref<PullRequestStatus | "">("");
const searchQuery = ref("");
const page = ref(0);

const queryParams = computed(() => ({
  projectId,
  status: (activeTab.value || undefined) as PullRequestStatus | undefined,
  search: searchQuery.value || undefined,
  limit: PAGE_SIZE,
  offset: page.value * PAGE_SIZE,
}));

const { state } = useQuery({
  key: () => [
    "pull-requests",
    projectId,
    activeTab.value,
    searchQuery.value,
    page.value,
  ],
  query: () => orpc.pullRequest.listProjectPRs(queryParams.value),
  placeholderData: [],
  enabled: !import.meta.env.SSR,
});

const prs = computed(() => state.value.data ?? []);
const hasMore = computed(() => prs.value.length >= PAGE_SIZE);

const setTab = (tab: PullRequestStatus | "") => {
  activeTab.value = tab;
  page.value = 0;
};

const debouncedSearch = useDebounceFn((val: string) => {
  searchQuery.value = val;
  page.value = 0;
}, 300);

const statusIcon = (status: string) => {
  switch (status) {
    case "MERGED":
      return { component: GitMerge, class: "text-purple-600" };
    case "CLOSED":
      return { component: CircleCheck, class: "text-gray-500" };
    default:
      return { component: CircleDot, class: "text-green-600" };
  }
};
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-semibold">{{ t("拉取请求") }}</h1>
      <Button
        v-perm="{ object: 'project', id: projectId, relation: 'editor' }"
        @click="navigate(`/project/${projectId}/pull-requests/new`)"
      >
        <div class="icon-[mdi--plus] size-4" />
        {{ t("新建拉取请求") }}
      </Button>
    </div>

    <!-- Toolbar: Search + Tabs -->
    <div class="flex items-center gap-4">
      <input
        type="text"
        :placeholder="t('搜索拉取请求...')"
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
          <CircleCheck class="mr-1 size-3.5 text-gray-500" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          :class="{ 'bg-accent': activeTab === 'MERGED' }"
          @click="setTab('MERGED')"
        >
          <GitMerge class="mr-1 size-3.5 text-purple-600" />
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
      v-else-if="prs.length === 0"
      class="py-8 text-center text-sm text-muted-foreground"
    >
      {{ t("暂无拉取请求") }}
    </div>

    <!-- List -->
    <ul v-else class="divide-y rounded-md border">
      <li v-for="pr in prs" :key="pr.id" class="px-4 py-3 hover:bg-accent">
        <a
          :href="`/project/${projectId}/pull-requests/${pr.number}`"
          class="flex items-start gap-3"
        >
          <component
            :is="statusIcon(pr.status).component"
            :class="['mt-0.5 size-4 shrink-0', statusIcon(pr.status).class]"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ pr.title }}</span>
              <Badge
                v-if="pr.type === 'AUTO_TRANSLATE'"
                variant="secondary"
                class="text-xs"
              >
                <Bot class="mr-0.5 size-3" />
                {{ t("自动") }}
              </Badge>
            </div>
            <p class="text-xs text-muted-foreground">
              {{
                t("#{id} · 创建于 {date}", {
                  id: pr.number,
                  date: new Date(pr.createdAt).toLocaleDateString("zh-CN"),
                })
              }}
            </p>
          </div>
        </a>
      </li>
    </ul>

    <!-- Pagination -->
    <div v-if="prs.length > 0" class="flex items-center justify-between">
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
