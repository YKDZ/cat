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
import { inject, onMounted, ref, watch, computed } from "vue";
import { useI18n } from "vue-i18n";

import LanguagePicker from "@/app/components/LanguagePicker.vue";
import { clientLogger as logger } from "@/app/utils/logger";
import { useInjectionKey } from "@/app/utils/provide";

import type { Data } from "./+data.server";

import { onRequestTermPair, type PairData } from "./PairTable.telefunc";

const { t } = useI18n();


const glossary = inject(useInjectionKey<Data>()("glossary"))!;


const terms = ref<PairData[]>([]);
const pageIndex = ref(0);
const pageSize = ref(10);
const total = ref(0);
const sourceLanguageId = ref("zh-Hans");
const targetLanguageId = ref("en");
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


const fetchTerms = async () => {
  isLoading.value = true;
  try {
    const result = await onRequestTermPair(
      glossary.id,
      sourceLanguageId.value,
      targetLanguageId.value,
      pageIndex.value,
      pageSize.value,
    );
    terms.value = result.data;
    total.value = result.total;
  } catch (err) {
    logger
      .withSituation("WEB")
      .error({ msg: "Failed to fetch term pairs:" }, err);
  } finally {
    isLoading.value = false;
  }
};


onMounted(() => {
  fetchTerms();
});


watch([sourceLanguageId, targetLanguageId, pageIndex], () => {
  fetchTerms();
});
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ t("术语对") }}</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="mb-4 flex gap-4">
        <LanguagePicker v-model="sourceLanguageId" :placeholder="t('源语言')" />
        <LanguagePicker
          v-model="targetLanguageId"
          :placeholder="t('目标语言')"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{{ t("术语") }}</TableHead>
            <TableHead>{{ t("翻译") }}</TableHead>
            <TableHead>{{ t("主题") }}</TableHead>
            <TableHead>{{ t("定义") }}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="isLoading">
            <TableRow v-for="i in pageSize" :key="i">
              <TableCell>
                <Skeleton class="h-4 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton class="h-4 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton class="h-4 w-48" />
              </TableCell>
            </TableRow>
          </template>
          <template v-else-if="terms.length === 0">
            <TableRow>
              <TableCell :colspan="3" class="py-8 text-center text-gray-500">
                {{ t("暂无数据") }}
              </TableCell>
            </TableRow>
          </template>
          <template v-else>
            <TableRow
              v-for="term in terms"
              :key="term.conceptId"
              class="cursor-pointer hover:bg-gray-100"
              @click="
                navigate(`/glossary/${glossary.id}/concept/${term.conceptId}`)
              "
            >
              <TableCell>{{ term.source.text }}</TableCell>
              <TableCell>{{ term.target.text }}</TableCell>
              <TableCell>{{ term.subject || t("-") }}</TableCell>
              <TableCell>{{ term.definition || t("-") }}</TableCell>
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
