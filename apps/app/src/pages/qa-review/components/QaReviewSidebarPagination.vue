<script setup lang="ts">
import { Button } from "@cat/ui";
import { useSidebar } from "@cat/ui";
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  ChevronsRightIcon,
  ChevronsLeftIcon,
} from "@lucide/vue";
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { buildQaReviewHref } from "@/pages/qa-review/scope-url";
import { useEditorContextStore } from "@/stores/editor/context";
import { useQaReviewWorkbenchStore } from "@/stores/qa-review/workbench";

const { t } = useI18n();
const contextStore = useEditorContextStore();
const workbench = useQaReviewWorkbenchStore();
const { scope, currentPage, pageSize } = storeToRefs(contextStore);
const { total, selectedElementId } = storeToRefs(workbench);

const sidebarId = "editor";
const { width: sidebarWidth } = useSidebar(sidebarId);

const isWideSidebar = computed(() => {
  return (sidebarWidth.value || 240) >= 320;
});

const totalPages = computed(() =>
  Math.max(1, Math.ceil(total.value / pageSize.value)),
);

const isFirstPage = computed(() => currentPage.value <= 1);
const isLastPage = computed(
  () => currentPage.value >= Math.max(currentPage.value, totalPages.value),
);

const displayRange = computed(() => {
  if (total.value === 0) {
    return { from: 0, to: 0 };
  }

  const from = (currentPage.value - 1) * pageSize.value + 1;
  const to = Math.min(currentPage.value * pageSize.value, total.value);
  return { from, to };
});

const toPage = async (page: number) => {
  if (!scope.value) return;
  if (page < 1 || page > Math.max(currentPage.value, totalPages.value)) {
    return;
  }

  contextStore.setCurrentPage(page);
  await workbench.refreshAll();
  const target = selectedElementId.value ?? "empty";
  await navigate(buildQaReviewHref(scope.value, target));
};
</script>

<template>
  <div class="flex w-full flex-col gap-1">
    <div
      :class="[
        'flex items-center justify-center',
        isWideSidebar ? 'gap-1' : 'gap-0.5',
      ]"
    >
      <Button
        variant="ghost"
        :size="isWideSidebar ? 'sm' : 'icon-sm'"
        :class="!isWideSidebar && 'px-1.5! pr-1.5!'"
        :disabled="isFirstPage"
        @click="toPage(1)"
      >
        <ChevronsLeftIcon :class="isWideSidebar ? 'h-4 w-4' : 'h-3 w-3'" />
      </Button>
      <Button
        variant="ghost"
        :size="isWideSidebar ? 'sm' : 'icon-sm'"
        :class="!isWideSidebar && 'px-1.5! pr-1.5!'"
        :disabled="isFirstPage"
        @click="toPage(currentPage - 1)"
      >
        <ChevronLeftIcon :class="isWideSidebar ? 'h-4 w-4' : 'h-3 w-3'" />
      </Button>

      <div
        :class="[
          'pointer-events-none flex items-center justify-center px-1',
          isWideSidebar ? 'min-w-14' : 'min-w-12',
        ]"
      >
        <span
          :class="[
            'font-medium tabular-nums',
            isWideSidebar ? 'text-sm' : 'text-xs',
          ]"
        >
          {{ currentPage }}/{{ Math.max(currentPage, totalPages) }}
        </span>
      </div>

      <Button
        variant="ghost"
        :size="isWideSidebar ? 'sm' : 'icon-sm'"
        :class="!isWideSidebar && 'px-1.5! pr-1.5!'"
        :disabled="isLastPage"
        @click="toPage(currentPage + 1)"
      >
        <ChevronRightIcon :class="isWideSidebar ? 'h-4 w-4' : 'h-3 w-3'" />
      </Button>
      <Button
        variant="ghost"
        :size="isWideSidebar ? 'sm' : 'icon-sm'"
        :class="!isWideSidebar && 'px-1.5! pr-1.5!'"
        :disabled="isLastPage"
        @click="toPage(Math.max(currentPage, totalPages))"
      >
        <ChevronsRightIcon :class="isWideSidebar ? 'h-4 w-4' : 'h-3 w-3'" />
      </Button>
    </div>

    <div class="flex items-center justify-center">
      <span
        :class="[
          'text-muted-foreground',
          isWideSidebar ? 'text-sm' : 'text-xs',
        ]"
      >
        {{
          t("显示 {from} - {to} 条，共 {total} 条", {
            from: displayRange.from,
            to: displayRange.to,
            total,
          })
        }}
      </span>
    </div>
  </div>
</template>
