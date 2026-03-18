<script setup lang="ts">
import {
  Pagination,
  PaginationContent,
  PaginationNext,
  PaginationPrevious,
  PaginationFirst,
  PaginationLast,
} from "@cat/ui";
import { useSidebar } from "@cat/ui";
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  ChevronsRightIcon,
  ChevronsLeftIcon,
} from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { computed, watch } from "vue";
import { useI18n } from "vue-i18n";

import { useEditorContextStore } from "@/app/stores/editor/context";
import { useEditorTableStore } from "@/app/stores/editor/table";

const { t } = useI18n();


const { currentPage } = storeToRefs(useEditorContextStore());
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


watch(
  currentPage,
  (newPage, oldPage) => {
    if (
      newPage !== oldPage &&
      newPage >= 1 &&
      newPage <= pageTotalAmount.value
    ) {
      toPage(newPage - 1);
    }
  },
  { immediate: false },
);


const displayRange = computed(() => {
  const from = (currentPage.value - 1) * 16 + 1;
  const to = Math.min(currentPage.value * 16, elementTotalAmount.value);
  return { from, to };
});
</script>

<template>
  <div class="flex w-full flex-col gap-1">
    <div
      :class="[
        'flex items-center justify-center gap-0.5',
        isWideSidebar ? 'gap-1' : 'gap-0.5',
      ]"
    >
      <Pagination
        :items-per-page="16"
        :total="elementTotalAmount"
        :sibling-count="0"
        v-model:page="currentPage"
      >
        <PaginationContent :class="isWideSidebar ? 'gap-1' : 'gap-0.5'">
          <PaginationFirst
            :size="isWideSidebar ? undefined : 'icon-sm'"
            :class="!isWideSidebar && 'px-1.5! pr-1.5!'"
            @click="currentPage = 1"
          >
            <ChevronsLeftIcon :class="isWideSidebar ? 'h-4 w-4' : 'h-3 w-3'" />
          </PaginationFirst>
          <PaginationPrevious
            :size="isWideSidebar ? undefined : 'icon-sm'"
            :class="!isWideSidebar && 'px-1.5! pr-1.5!'"
          >
            <ChevronLeftIcon :class="isWideSidebar ? 'h-4 w-4' : 'h-3 w-3'" />
          </PaginationPrevious>

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

          <PaginationNext
            :size="isWideSidebar ? undefined : 'icon-sm'"
            :class="!isWideSidebar && 'px-1.5! pr-1.5!'"
          >
            <ChevronRightIcon :class="isWideSidebar ? 'h-4 w-4' : 'h-3 w-3'" />
          </PaginationNext>
          <PaginationLast
            :size="isWideSidebar ? undefined : 'icon-sm'"
            :class="!isWideSidebar && 'px-1.5! pr-1.5!'"
            @click="currentPage = pageTotalAmount"
          >
            <ChevronsRightIcon :class="isWideSidebar ? 'h-4 w-4' : 'h-3 w-3'" />
          </PaginationLast>
        </PaginationContent>
      </Pagination>
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
