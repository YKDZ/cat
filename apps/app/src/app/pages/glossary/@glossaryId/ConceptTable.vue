<script setup lang="ts">
import {
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
} from "@cat/ui";
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@cat/ui";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-vue-next";
import { navigate } from "vike/client/router";
import { inject, onMounted, ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";

import { clientLogger as logger } from "@/app/utils/logger";
import { useInjectionKey } from "@/app/utils/provide";

import type { Data } from "./+data.server";

import { onRequestConcept, type ConceptData } from "./ConceptTable.telefunc";

const { t } = useI18n();


const glossary = inject(useInjectionKey<Data>()("glossary"))!;


const concepts = ref<ConceptData[]>([]);
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


const fetchConcepts = async () => {
  isLoading.value = true;
  try {
    const result = await onRequestConcept(
      glossary.id,
      pageIndex.value,
      pageSize.value,
    );
    concepts.value = result.data;
    total.value = result.total;
  } catch (err) {
    logger.withSituation("WEB").error(err, "Failed to fetch concepts");
  } finally {
    isLoading.value = false;
  }
};


onMounted(() => {
  fetchConcepts();
});


watch([pageIndex], () => {
  fetchConcepts();
});
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ t("术语概念") }}</CardTitle>
    </CardHeader>
    <CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{{ t("主题") }}</TableHead>
            <TableHead>{{ t("定义") }}</TableHead>
            <TableHead>{{ t("术语数量") }}</TableHead>
            <TableHead>{{ t("示例") }}</TableHead>
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
                <Skeleton class="h-6 w-20" />
              </TableCell>
              <TableCell>
                <div class="flex flex-wrap gap-1">
                  <Skeleton class="h-5 w-16" />
                  <Skeleton class="h-5 w-16" />
                  <Skeleton class="h-5 w-16" />
                </div>
              </TableCell>
            </TableRow>
          </template>
          <template v-else-if="concepts.length === 0">
            <TableRow>
              <TableCell :colspan="4" class="py-8 text-center text-gray-500">
                {{ t("暂无数据") }}
              </TableCell>
            </TableRow>
          </template>
          <template v-else>
            <TableRow
              v-for="concept in concepts"
              :key="concept.id"
              class="cursor-pointer hover:bg-gray-100"
              @click="
                navigate(`/glossary/${glossary.id}/concept/${concept.id}`)
              "
            >
              <TableCell>
                <span class="font-medium">{{
                  concept.subjects?.[0]?.subject || t("（未命名）")
                }}</span>
              </TableCell>
              <TableCell>
                <span class="text-gray-600">{{
                  concept.definition ||
                  concept.subjects?.[0]?.defaultDefinition ||
                  t("—")
                }}</span>
              </TableCell>
              <TableCell>
                <span
                  class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium"
                  :class="{
                    'bg-blue-100 text-blue-800': concept.termCount > 0,
                    'bg-gray-100 text-gray-800': concept.termCount === 0,
                  }"
                >
                  {{ t("{amount} 个术语", { amount: concept.termCount }) }}
                </span>
              </TableCell>
              <TableCell class="max-w-md">
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="termItem in concept.sampleTerms"
                    :key="termItem.id"
                    class="inline-flex items-center rounded border px-2 py-1 text-xs"
                    :title="
                      t('类型：{type} | 状态：{status}', {
                        type: t(termItem.type),
                        status: t(termItem.status),
                      })
                    "
                  >
                    {{ termItem.text }}
                  </span>
                  <span
                    v-if="concept.termCount > concept.sampleTerms.length"
                    class="inline-flex items-center rounded px-2 py-1 text-xs text-gray-500"
                  >
                    +{{ concept.termCount - concept.sampleTerms.length }}
                  </span>
                  <span
                    v-if="concept.sampleTerms.length === 0"
                    class="text-xs text-gray-400"
                  >
                    {{ t("无术语") }}
                  </span>
                </div>
              </TableCell>
            </TableRow>
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
            <PaginationFirst size="icon-sm" class="!px-1.5 !pr-1.5">
              <ChevronsLeftIcon class="h-3 w-3" />
            </PaginationFirst>
            <PaginationPrevious size="icon-sm" class="!px-1.5 !pr-1.5">
              <ChevronLeftIcon class="h-3 w-3" />
            </PaginationPrevious>

            <div
              class="pointer-events-none flex min-w-[3rem] items-center justify-center px-1"
            >
              <span class="text-xs font-medium tabular-nums">
                {{ currentPage }}/{{ Math.max(1, pageTotalAmount) }}
              </span>
            </div>

            <PaginationNext size="icon-sm" class="!px-1.5 !pr-1.5">
              <ChevronRightIcon class="h-3 w-3" />
            </PaginationNext>
            <PaginationLast size="icon-sm" class="!px-1.5 !pr-1.5">
              <ChevronsRightIcon class="h-3 w-3" />
            </PaginationLast>
          </PaginationContent>
        </Pagination>
      </div>
    </CardContent>
  </Card>
</template>
