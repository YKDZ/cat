<script setup lang="ts">
import type { EditorTranslationStatusFilter } from "@cat/shared";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cat/ui";
import { ChevronDown } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { useEditorContextStore } from "@/stores/editor/context.ts";

import { buildEditorHref } from "./scope-url";

const { t } = useI18n();
const contextStore = useEditorContextStore();
const { statusFilter } = storeToRefs(contextStore);

const options: Array<{ value: EditorTranslationStatusFilter; label: string }> =
  [
    { value: "all", label: "全部状态" },
    { value: "untranslated", label: "未翻译" },
    { value: "translated", label: "已翻译" },
    { value: "approved", label: "已批准" },
    { value: "unapproved", label: "未批准" },
  ];

const currentLabel = computed(
  () =>
    options.find((option) => option.value === statusFilter.value)?.label ??
    "状态",
);

const updateStatus = async (value: EditorTranslationStatusFilter) => {
  contextStore.setStatusFilter(value);
  contextStore.setCurrentPage(1);
  if (contextStore.scope) {
    await navigate(buildEditorHref(contextStore.scope, "auto"));
  }
};
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" size="sm" class="h-8 gap-2">
        {{ t(currentLabel) }}
        <ChevronDown class="size-4 text-muted-foreground" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      <DropdownMenuItem
        v-for="option in options"
        :key="option.value"
        @click="updateStatus(option.value)"
      >
        {{ t(option.label) }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
