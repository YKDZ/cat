<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { CircleAlert, TriangleAlert, Info, Check } from "lucide-vue-next";
import { Button } from "@/app/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import type { QAIssue, Token } from "@cat/plugin-core";
import type { QASeverity } from "@cat/plugin-core";
import { useI18n } from "vue-i18n";
import { ws } from "@/server/ws";
import { consumeEventIterator } from "@orpc/client";
import { logger } from "@cat/shared/utils";

const props = defineProps<{
  source: {
    text: string;
    tokens: Token[];
    languageId: string;
  };
  translation: {
    text: string;
    tokens: Token[];
    languageId: string;
  };
  documentId?: string;
}>();

const { t } = useI18n();

const isOpen = ref(false);
const issues = ref<(QAIssue & { checkerId: number })[]>([]);
let cancel: (() => Promise<void>) | undefined;

const update = async () => {
  if (!props.documentId) return;

  if (cancel) {
    await cancel();
  }

  issues.value = [];

  cancel = consumeEventIterator(
    ws.qa.check({
      source: props.source,
      translation: props.translation,
      documentId: props.documentId,
    }),
    {
      onEvent: (issue) => {
        issues.value.push(issue);
      },
      onError: (error) => {
        if (
          error instanceof Error &&
          error.message === "Stream was cancelled"
        ) {
          return;
        }
        logger.error("WEB", { msg: "Error when consume qa issues" }, error);
      },
    },
  );
};

const hasIssues = computed(() => issues.value.length > 0);

const getSeverityStyle = (severity: QASeverity) => {
  switch (severity) {
    case "error":
      return { color: "text-red-500", icon: CircleAlert };
    case "warning":
      return { color: "text-yellow-500", icon: TriangleAlert };
    case "info":
    default:
      return { color: "text-blue-500", icon: Info };
  }
};

const primaryStatus = computed(() => {
  if (issues.value.some((i) => i.severity === "error"))
    return getSeverityStyle("error");
  if (issues.value.some((i) => i.severity === "warning"))
    return getSeverityStyle("warning");
  return getSeverityStyle("info");
});

watch(
  () => [props.source, props.translation, props.documentId],
  () => {
    update();
  },
);
</script>

<template>
  <Popover :modal="false" v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button
        size="icon"
        variant="ghost"
        class="h-8 w-8 transition-all duration-200"
        :class="primaryStatus.color"
      >
        <component v-if="hasIssues" :is="primaryStatus.icon" class="h-4 w-4" />
        <Check v-else />
      </Button>
    </PopoverTrigger>

    <PopoverContent class="w-auto">
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between pb-1">
          <span class="text-xs font-semibold text-muted-foreground">
            {{ t("翻译质量检查 ({amount})", { amount: issues.length }) }}
          </span>
        </div>

        <div class="flex flex-col gap-1.5 max-h-75 overflow-y-auto">
          <span v-if="!hasIssues" class="text-sm text-foreground/90">{{
            t("无质量问题")
          }}</span>

          <div
            v-else
            v-for="(issue, index) in issues"
            :key="issue.checkerId + index"
            class="flex items-start gap-2 text-sm max-w-62.5"
          >
            <component
              :is="getSeverityStyle(issue.severity).icon"
              class="h-4 w-4 shrink-0 mt-0.5"
              :class="getSeverityStyle(issue.severity).color"
            />
            <span class="text-foreground/90 wrap-break-word leading-tight">
              {{ issue.message }}
            </span>
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
