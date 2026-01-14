<script setup lang="ts">
import { useQuery } from "@pinia/colada";
import { orpc } from "@/server/orpc";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Check, TriangleAlert, Info, CircleX, Loader2 } from "lucide-vue-next";

const props = defineProps<{
  translationId: number;
}>();

const { t } = useI18n();

const { state: qaResultsState } = useQuery({
  key: () => ["qaResults", props.translationId],
  query: () =>
    orpc.translation.getQAResults({ translationId: props.translationId }),
});

const latestResult = computed(() => {
  const results = qaResultsState.value?.data;
  if (!results || results.length === 0) return null;
  // Sort by ID desc to get the latest result
  return [...results].sort((a, b) => b.id - a.id)[0];
});

const { state: qaItemsState } = useQuery({
  key: () => ["qaItems", latestResult.value?.id ?? 0],
  enabled: () => !!latestResult.value,
  query: () =>
    orpc.translation.getQAResultItems({ qaResultId: latestResult.value!.id }),
});

const items = computed(
  () => qaItemsState.value?.data?.filter((item) => !item.isPassed) ?? [],
);

interface QaIssueMeta {
  severity: "error" | "warning" | "info";
  message: string;
  targetTokenIndex?: number | null;
}

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case "error":
      return CircleX;
    case "warning":
      return TriangleAlert;
    case "info":
      return Info;
    default:
      return Info;
  }
};
</script>

<template>
  <div class="space-y-2">
    <!-- Loading State -->
    <div
      v-if="qaResultsState?.status === 'pending'"
      class="flex items-center gap-2 p-2 text-sm text-muted-foreground"
    >
      <Loader2 class="w-4 h-4 animate-spin" />
      <span>{{ t("正在加载 QA 结果...") }}</span>
    </div>

    <!-- Error State (Network/Server error, not QA error) -->
    <div
      v-else-if="qaResultsState?.error || qaItemsState?.error"
      class="p-2 text-sm text-destructive bg-destructive/10 rounded-md"
    >
      {{ t("加载 QA 结果失败") }}
    </div>

    <!-- Results Display -->
    <div v-else-if="latestResult">
      <!-- Has Issues -->
      <div v-if="items.length > 0" class="flex flex-col gap-2">
        <div
          v-for="item in items"
          :key="item.id"
          class="flex gap-2 items-start text-sm p-3 rounded-md border bg-card text-card-foreground shadow-xs animate-in fade-in zoom-in-95 duration-200"
        >
          <component
            :is="
              getSeverityIcon((item.meta as unknown as QaIssueMeta).severity)
            "
            class="w-4 h-4 mt-0.5 shrink-0"
            :class="{
              'text-destructive':
                (item.meta as unknown as QaIssueMeta).severity === 'error',
              'text-amber-500':
                (item.meta as unknown as QaIssueMeta).severity === 'warning',
              'text-blue-500':
                (item.meta as unknown as QaIssueMeta).severity === 'info',
            }"
          />
          <div class="flex-1 min-w-0">
            <div
              class="font-semibold text-xs text-muted-foreground mb-1 uppercase tracking-wider"
            >
              {{ (item.meta as unknown as QaIssueMeta).severity }}
            </div>
            <div class="leading-relaxed">
              {{ (item.meta as unknown as QaIssueMeta).message }}
            </div>
          </div>
        </div>
      </div>

      <!-- No Issues (Positive feedback) -->
      <div
        v-else
        class="flex flex-col items-center justify-center p-6 gap-2 text-green-600 bg-green-50/50 rounded-md border border-green-100 animate-in fade-in zoom-in-95 duration-200"
      >
        <div class="p-2 bg-green-100 rounded-full">
          <Check class="w-5 h-5" />
        </div>
        <span class="text-sm font-medium">{{
          t("QA 检查通过，未发现问题")
        }}</span>
      </div>
    </div>

    <!-- No QA Results (Not checked yet) -->
    <div
      v-else
      class="p-4 text-center text-muted-foreground text-sm border border-dashed rounded-md bg-muted/30"
    >
      {{ t("暂无 QA 检查记录") }}
    </div>
  </div>
</template>
