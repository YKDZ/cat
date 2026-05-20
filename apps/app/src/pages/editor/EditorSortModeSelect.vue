<script setup lang="ts">
import type { ElementSortMode } from "@cat/shared";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@cat/ui";
import { ArrowDownWideNarrow } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { useEditorContextStore } from "@/stores/editor/context.ts";

import { buildEditorHref } from "./scope-url";

const { t } = useI18n();
const contextStore = useEditorContextStore();
const { scope, sortMode } = storeToRefs(contextStore);

const options: Array<{
  value: ElementSortMode;
  label: string;
  description: string;
}> = [
  {
    value: "structure",
    label: "结构顺序",
    description: "按内容树与文件内顺序浏览",
  },
  {
    value: "reuse-first",
    label: "复用优先",
    description: "优先处理短语、模板和邻近上下文",
  },
];

const selectedOption = computed(
  () => options.find((option) => option.value === sortMode.value) ?? options[0],
);

const updateSortMode = async (value: ElementSortMode) => {
  if (!scope.value || value === sortMode.value) return;

  contextStore.setSortMode(value);
  if (!scope.value) return;
  await navigate(buildEditorHref(scope.value, "auto"));
};
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="outline"
        size="sm"
        class="h-8 gap-2"
        :aria-label="t('元素排序模式')"
      >
        <ArrowDownWideNarrow class="size-4" aria-hidden="true" />
        <span class="hidden sm:inline">{{ t(selectedOption.label) }}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-64">
      <DropdownMenuLabel>{{ t("元素排序模式") }}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        v-for="option in options"
        :key="option.value"
        class="flex flex-col items-start gap-1"
        @select="() => updateSortMode(option.value)"
      >
        <span class="font-medium">{{ t(option.label) }}</span>
        <span class="text-xs text-muted-foreground">
          {{ t(option.description) }}
        </span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
