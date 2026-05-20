<script setup lang="ts">
import { Badge, Button } from "@cat/ui";
import { useQuery } from "@pinia/colada";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/rpc/orpc";

import {
  buildQaReviewHref,
  parseQaReviewScopeFromRoute,
} from "../../../../scope-url";

const ctx = usePageContext();
const { t } = useI18n();

const scope = computed(() =>
  parseQaReviewScopeFromRoute({
    projectId: ctx.routeParams.projectId,
    languageToId: ctx.routeParams.languageToId,
    searchParams: new URLSearchParams(ctx.urlParsed.searchOriginal ?? ""),
  }),
);

const routeQueueItemId = computed(() => {
  const raw = String(ctx.routeParams.queueItemId ?? "auto");
  if (!/^\d+$/.test(raw)) return null;

  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
});

const queueInput = computed(() => ({
  ...scope.value,
  page: scope.value.page - 1,
  queueFilters: {
    queueStatus: [],
    riskBucket: [],
    findingAction: [],
    includeResolved: false,
  },
}));

const countInput = computed(() => {
  const input = queueInput.value;
  return {
    projectId: input.projectId,
    languageToId: input.languageToId,
    branchId: input.branchId,
    contentNodeIds: input.contentNodeIds,
    searchQuery: input.searchQuery,
    statusFilter: input.statusFilter,
    sortMode: input.sortMode,
    queueFilters: input.queueFilters,
  };
});

const { state: queueState } = useQuery({
  key: () => ["qa-review", "queue", queueInput.value],
  enabled: () => !import.meta.env.SSR,
  placeholderData: [],
  query: async () => await orpc.qaReview.listQueue(queueInput.value),
});

const { state: countState } = useQuery({
  key: () => ["qa-review", "count", countInput.value],
  enabled: () => !import.meta.env.SSR,
  placeholderData: 0,
  query: async () => await orpc.qaReview.countQueue(countInput.value),
});

const queueItems = computed(() => queueState.value.data ?? []);
const total = computed(() => countState.value.data ?? 0);

const selectedQueueItemId = computed(
  () => routeQueueItemId.value ?? queueItems.value[0]?.queueItem.id ?? null,
);

const { state: detailState } = useQuery({
  key: () => [
    "qa-review",
    "detail",
    scope.value.projectId,
    selectedQueueItemId.value,
  ],
  enabled: () => !import.meta.env.SSR && selectedQueueItemId.value !== null,
  query: async () => {
    if (selectedQueueItemId.value === null) return null;
    return await orpc.qaReview.getQueueItem({
      projectId: scope.value.projectId,
      queueItemId: selectedQueueItemId.value,
    });
  },
});

const detail = computed(() => detailState.value.data ?? null);

const openQueueItem = async (queueItemId: number) => {
  await navigate(buildQaReviewHref(scope.value, queueItemId));
};

const openEditor = async (elementId: number) => {
  await navigate(
    `/editor/project/${scope.value.projectId}/${scope.value.languageToId}/${elementId}`,
  );
};

const riskLabel = (bucket: string) => {
  switch (bucket) {
    case "BLOCKING":
      return t("阻断批准");
    case "HIGH":
      return t("高风险");
    case "MEDIUM":
      return t("中风险");
    case "LOW":
      return t("低风险");
    default:
      return t("信息性");
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case "BLOCKED":
      return t("已阻断");
    case "REQUEST_CHANGES":
      return t("请求修改");
    case "APPROVABLE":
      return t("可批准");
    case "CLAIMED":
      return t("已认领");
    case "RESOLVED":
      return t("已解决");
    case "SUPERSEDED":
      return t("已替代");
    default:
      return t("待审校");
  }
};

const actionLabel = (action: string) => {
  switch (action) {
    case "BLOCK_APPROVAL":
      return t("阻断批准");
    case "NEEDS_REVIEW":
      return t("需要人工审核");
    case "INFORMATIONAL":
      return t("信息性");
    case "PASS":
      return t("通过");
    case "SUPPRESSED":
      return t("已抑制");
    default:
      return action;
  }
};

const severityLabel = (severity: string) => {
  switch (severity) {
    case "error":
      return t("错误");
    case "warning":
      return t("警告");
    case "info":
      return t("信息");
    default:
      return severity;
  }
};
</script>

<template>
  <div class="flex h-full min-h-0 w-full flex-col gap-4 p-4">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">{{ t("QA 审校工作台") }}</h1>
        <p class="text-sm text-muted-foreground">
          {{ t("按风险优先处理机器 QA 与人工审校队列") }}
        </p>
      </div>
      <Badge variant="secondary">
        {{ t("{count} 个待审校项", { count: total }) }}
      </Badge>
    </header>

    <div class="grid min-h-0 flex-1 gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside class="min-h-0 overflow-auto rounded-lg border bg-card">
        <div class="border-b p-3 font-medium">{{ t("审校队列") }}</div>
        <div v-if="queueState.status === 'pending'" class="p-4 text-sm">
          {{ t("加载中...") }}
        </div>
        <div
          v-else-if="queueItems.length === 0"
          class="p-4 text-sm text-muted-foreground"
        >
          {{ t("暂无待审校项") }}
        </div>
        <template v-else>
          <button
            v-for="item in queueItems"
            :key="item.queueItem.id"
            type="button"
            class="flex w-full flex-col gap-2 border-b p-3 text-left transition-colors hover:bg-muted/60"
            :class="{
              'bg-muted': item.queueItem.id === selectedQueueItemId,
            }"
            @click="openQueueItem(item.queueItem.id)"
          >
            <div class="flex items-center justify-between gap-2">
              <Badge variant="outline">
                {{ riskLabel(item.queueItem.riskBucket) }}
              </Badge>
              <span class="text-xs text-muted-foreground">
                {{ statusLabel(item.queueItem.status) }}
              </span>
            </div>
            <p class="line-clamp-2 text-sm font-medium">
              {{ item.sourceText }}
            </p>
            <p class="line-clamp-2 text-sm text-muted-foreground">
              {{ item.translationText ?? t("暂无候选译文") }}
            </p>
            <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>
                {{
                  t("{count} 个阻断发现", {
                    count: item.queueItem.hardFindingCount,
                  })
                }}
              </span>
              <span>
                {{
                  t("{count} 个软性发现", {
                    count: item.queueItem.softFindingCount,
                  })
                }}
              </span>
            </div>
          </button>
        </template>
      </aside>

      <main class="min-h-0 overflow-auto rounded-lg border bg-card p-4">
        <div v-if="detailState.status === 'pending'" class="text-sm">
          {{ t("加载中...") }}
        </div>
        <div
          v-else-if="!detail"
          class="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground"
        >
          <div class="icon-[mdi--clipboard-check-outline] size-12" />
          <p>{{ t("选择一个队列项开始审校") }}</p>
        </div>
        <div v-else class="flex flex-col gap-4">
          <section class="rounded-lg border p-4">
            <div class="mb-2 text-sm font-medium text-muted-foreground">
              {{ t("源文") }}
            </div>
            <p class="text-base whitespace-pre-wrap">{{ detail.sourceText }}</p>
          </section>

          <section class="rounded-lg border p-4">
            <div class="mb-2 text-sm font-medium text-muted-foreground">
              {{ t("候选译文") }}
            </div>
            <p class="text-base whitespace-pre-wrap">
              {{ detail.candidateTranslation?.text ?? t("暂无候选译文") }}
            </p>
          </section>

          <section class="rounded-lg border p-4">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="font-semibold">{{ t("审校发现") }}</h2>
              <Badge variant="secondary">
                {{ t("{count} 个发现", { count: detail.findings.length }) }}
              </Badge>
            </div>
            <div
              v-if="detail.findings.length === 0"
              class="text-sm text-muted-foreground"
            >
              {{ t("暂无审校发现") }}
            </div>
            <div v-else class="flex flex-col gap-2">
              <div
                v-for="finding in detail.findings"
                :key="finding.id"
                class="rounded-md border p-3"
              >
                <div class="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{{
                    actionLabel(finding.action)
                  }}</Badge>
                  <span class="text-xs text-muted-foreground">
                    {{ finding.ruleFamily }} ·
                    {{ severityLabel(finding.severity) }}
                  </span>
                </div>
                <p class="text-sm">{{ finding.message }}</p>
                <p
                  v-if="finding.explanation"
                  class="mt-1 text-sm text-muted-foreground"
                >
                  {{ finding.explanation }}
                </p>
              </div>
            </div>
          </section>

          <section class="rounded-lg border p-4">
            <h2 class="mb-3 font-semibold">{{ t("批注") }}</h2>
            <div
              v-if="detail.annotations.length === 0"
              class="text-sm text-muted-foreground"
            >
              {{ t("暂无批注") }}
            </div>
            <div v-else class="flex flex-col gap-2">
              <div
                v-for="annotation in detail.annotations"
                :key="annotation.id"
                class="rounded-md border p-3"
              >
                <div class="mb-1 text-xs text-muted-foreground">
                  {{ annotation.intent }} · {{ annotation.status }}
                </div>
                <p class="text-sm whitespace-pre-wrap">{{ annotation.body }}</p>
              </div>
            </div>
          </section>

          <div class="flex justify-end">
            <Button
              variant="outline"
              @click="openEditor(detail.queueItem.elementId)"
            >
              <div class="icon-[mdi--text-box-edit-outline] size-4" />
              {{ t("在编辑工作台打开") }}
            </Button>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
