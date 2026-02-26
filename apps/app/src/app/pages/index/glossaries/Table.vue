<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import { onRequestGlossaries, type GlossaryListItem } from "./Table.telefunc";
import TableItem from "./TableItem.vue";
import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Pagination,
  PaginationContent,
  PaginationFirst,
  PaginationLast,
  PaginationNext,
  PaginationPrevious,
} from "@cat/app-ui";
import { useI18n } from "vue-i18n";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-vue-next";

const { t } = useI18n();
const ctx = usePageContext();

const glossaries = ref<GlossaryListItem[]>([]);
const pageIndex = ref(0);
const pageSize = ref(10);
const total = ref(0);
const isLoading = ref(false);

const currentPage = computed({
  get: () => pageIndex.value + 1,
  set: (value) => {
    pageIndex.value = value - 1;
  },
});

const pageTotalAmount = computed(() =>
  total.value > 0 ? Math.ceil(total.value / pageSize.value) : 1,
);

const displayRange = computed(() => {
  const from = pageIndex.value * pageSize.value + 1;
  const to = Math.min((pageIndex.value + 1) * pageSize.value, total.value);
  return { from, to };
});

const fetchGlossaries = async () => {
  if (!ctx.user) return;

  isLoading.value = true;
  try {
    const result = await onRequestGlossaries(
      ctx.user.id,
      pageIndex.value,
      pageSize.value,
    );
    glossaries.value = result.data;
    total.value = result.total;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to fetch glossaries:", err);
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchGlossaries();
});

watch([pageIndex], () => {
  fetchGlossaries();
});
</script>

<template>
  <div class="w-full">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{{ t("名称") }}</TableHead>
          <TableHead>{{ t("描述") }}</TableHead>
          <TableHead>{{ t("创建时间") }}</TableHead>
          <TableHead>{{ t("更新时间") }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <template v-if="isLoading">
          <TableRow v-for="i in pageSize" :key="i">
            <TableCell>
              <Skeleton class="h-4 w-32" />
            </TableCell>
            <TableCell>
              <Skeleton class="h-4 w-48" />
            </TableCell>
            <TableCell>
              <Skeleton class="h-4 w-24" />
            </TableCell>
            <TableCell>
              <Skeleton class="h-4 w-24" />
            </TableCell>
          </TableRow>
        </template>
        <template v-else-if="glossaries.length === 0">
          <TableRow>
            <TableCell :colspan="4" class="py-8 text-center text-gray-500">
              {{ t("暂无数据") }}
            </TableCell>
          </TableRow>
        </template>
        <template v-else>
          <TableItem
            v-for="glossary in glossaries"
            :key="glossary.id"
            :glossary
          />
        </template>
      </TableBody>
    </Table>

    <!-- 分页 -->
    <div v-if="total > 0" class="mt-4 flex items-center justify-between">
      <div class="text-sm text-muted-foreground">
        {{
          t("显示 {from} - {to} 条，共 {total} 条", {
            from: displayRange.from,
            to: displayRange.to,
            total: total,
          })
        }}
      </div>
      <Pagination
        :items-per-page="pageSize"
        :total="total"
        :sibling-count="0"
        v-model:page="currentPage"
      >
        <PaginationContent class="gap-0.5">
          <PaginationFirst size="icon-sm" class="px-1.5! pr-1.5!">
            <ChevronsLeftIcon class="h-3 w-3" />
          </PaginationFirst>
          <PaginationPrevious size="icon-sm" class="px-1.5! pr-1.5!">
            <ChevronLeftIcon class="h-3 w-3" />
          </PaginationPrevious>

          <div
            class="pointer-events-none flex min-w-12 items-center justify-center px-1"
          >
            <span class="text-xs font-medium tabular-nums">
              {{ currentPage }}/{{ Math.max(1, pageTotalAmount) }}
            </span>
          </div>

          <PaginationNext size="icon-sm" class="px-1.5! pr-1.5!">
            <ChevronRightIcon class="h-3 w-3" />
          </PaginationNext>
          <PaginationLast size="icon-sm" class="px-1.5! pr-1.5!">
            <ChevronsRightIcon class="h-3 w-3" />
          </PaginationLast>
        </PaginationContent>
      </Pagination>
    </div>
  </div>
</template>
