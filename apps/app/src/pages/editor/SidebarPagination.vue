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
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { useEditorContextStore } from "@/stores/editor/context";
import { useEditorTableStore } from "@/stores/editor/table";

const { t } = useI18n();

const { currentPage, pageSize } = storeToRefs(useEditorContextStore());
const { elementTotalAmount, pageTotalAmount } = storeToRefs(
  useEditorTableStore(),
);

const { toPage } = useEditorTableStore();

// 获取侧边栏宽度
const sidebarId = "editor";
const { width: sidebarWidth } = useSidebar(sidebarId);

// 根据宽度判断是否应该显示大尺寸
const isWideSidebar = computed(() => {
  return (sidebarWidth.value || 240) >= 320;
});

const isFirstPage = computed(() => currentPage.value <= 1);
const isLastPage = computed(
  () => currentPage.value >= Math.max(1, pageTotalAmount.value),
);

const handlePageChange = (page: number) => {
  if (page < 1 || page > Math.max(1, pageTotalAmount.value)) return;
  currentPage.value = page;
  void toPage(page);
};

const displayRange = computed(() => {
  if (elementTotalAmount.value === 0) {
    return { from: 0, to: 0 };
  }

  const from = (currentPage.value - 1) * pageSize.value + 1;
  const to = Math.min(
    currentPage.value * pageSize.value,
    elementTotalAmount.value,
  );
  return { from, to };
});
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
        @click="handlePageChange(1)"
      >
        <ChevronsLeftIcon :class="isWideSidebar ? 'h-4 w-4' : 'h-3 w-3'" />
      </Button>
      <Button
        variant="ghost"
        :size="isWideSidebar ? 'sm' : 'icon-sm'"
        :class="!isWideSidebar && 'px-1.5! pr-1.5!'"
        :disabled="isFirstPage"
        @click="handlePageChange(currentPage - 1)"
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
          {{ currentPage }}/{{ Math.max(1, pageTotalAmount) }}
        </span>
      </div>

      <Button
        variant="ghost"
        :size="isWideSidebar ? 'sm' : 'icon-sm'"
        :class="!isWideSidebar && 'px-1.5! pr-1.5!'"
        :disabled="isLastPage"
        @click="handlePageChange(currentPage + 1)"
      >
        <ChevronRightIcon :class="isWideSidebar ? 'h-4 w-4' : 'h-3 w-3'" />
      </Button>
      <Button
        variant="ghost"
        :size="isWideSidebar ? 'sm' : 'icon-sm'"
        :class="!isWideSidebar && 'px-1.5! pr-1.5!'"
        :disabled="isLastPage"
        @click="handlePageChange(Math.max(1, pageTotalAmount))"
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
            total: elementTotalAmount,
          })
        }}
      </span>
    </div>
  </div>
</template>
