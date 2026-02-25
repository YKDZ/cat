<script setup lang="ts">
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { inject, onMounted, ref, computed, watch } from "vue";
import { onRequestConcept, type ConceptData } from "./ConceptTable.telefunc";
import { useInjectionKey } from "@/app/utils/provide";
import type { Data } from "./+data.server";
import { logger } from "@cat/shared/utils";
import { navigate } from "vike/client/router";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import Skeleton from "@/app/components/ui/skeleton/Skeleton.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const glossary = inject(useInjectionKey<Data>()("glossary"))!;

const concepts = ref<ConceptData[]>([]);
const pageIndex = ref(0);
const pageSize = ref(10);
const total = ref(0);
const isLoading = ref(false);

const totalPages = computed(() =>
  total.value > 0 ? Math.ceil(total.value / pageSize.value) : 0,
);

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
    logger.error("WEB", { msg: "Failed to fetch concepts:" }, err);
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

const goToPage = (page: number) => {
  if (page >= 0 && page < totalPages.value) {
    pageIndex.value = page;
  }
};
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
              <TableCell :colspan="4" class="text-center text-gray-500 py-8">
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
                  concept.subject || t("（未命名）")
                }}</span>
              </TableCell>
              <TableCell>
                <span class="text-gray-600">{{
                  concept.definition || t("—")
                }}</span>
              </TableCell>
              <TableCell>
                <span
                  class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
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
                    class="inline-flex items-center px-2 py-1 rounded text-xs border"
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
                    class="inline-flex items-center px-2 py-1 rounded text-xs text-gray-500"
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
      <div v-if="total > 0" class="flex items-center justify-between mt-4">
        <div class="text-sm text-gray-600">
          {{
            t("显示 {from} - {to} 条，共 {total} 条", {
              from: pageIndex * pageSize + 1,
              to: Math.min((pageIndex + 1) * pageSize, total),
              total: total,
            })
          }}
        </div>
        <div class="flex gap-2">
          <Button
            variant="outline"
            :disabled="pageIndex <= 0"
            @click="goToPage(pageIndex - 1)"
          >
            {{ t("上一页") }}
          </Button>

          <span class="px-3 py-1 border rounded">
            {{ pageIndex + 1 }} / {{ totalPages }}
          </span>

          <Button
            variant="outline"
            :disabled="pageIndex >= totalPages - 1"
            @click="goToPage(pageIndex + 1)"
          >
            {{ t("下一页") }}
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
