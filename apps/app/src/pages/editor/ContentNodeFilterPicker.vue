<script setup lang="ts">
import type { EditorContentNodeFilter } from "@cat/shared";

import {
  Button,
  Combobox,
  ComboboxAnchor,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@cat/ui";
import { Plus } from "@lucide/vue";
import { useQuery } from "@pinia/colada";
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/rpc/orpc";
import { useEditorContextStore } from "@/stores/editor/context";

import { buildEditorHref } from "./scope-url";

const { t } = useI18n();
const contextStore = useEditorContextStore();
const { scope, contentNodeIds } = storeToRefs(contextStore);
const searchTerm = ref("");

const { state } = useQuery({
  key: () => [
    "editor-content-node-filters",
    scope.value?.projectId ?? null,
    scope.value?.branchId ?? null,
  ],
  query: async (): Promise<EditorContentNodeFilter[]> => {
    if (!scope.value) return [];
    return await orpc.editor.listContentNodes({
      projectId: scope.value.projectId,
      branchId: scope.value.branchId,
    });
  },
  placeholderData: [] as EditorContentNodeFilter[],
  enabled: () => !import.meta.env.SSR && !!scope.value,
});

const availableNodes = computed(() => {
  const selected = new Set(contentNodeIds.value);
  const query = searchTerm.value.trim().toLowerCase();

  return (state.value.data ?? []).filter((node) => {
    if (selected.has(node.id) || node.kind === "PROJECT_ROOT") {
      return false;
    }

    if (!query) return true;
    const label = node.path
      .map((item) => item.label)
      .join(" / ")
      .toLowerCase();
    return label.includes(query) || node.label.toLowerCase().includes(query);
  });
});

const handleSelect = async (node: EditorContentNodeFilter) => {
  if (!scope.value) return;
  contextStore.setContentNodeFilters([...contentNodeIds.value, node.id]);
  searchTerm.value = "";
  if (contextStore.scope) {
    await navigate(buildEditorHref(contextStore.scope, "auto"));
  }
};
</script>

<template>
  <Combobox v-model:search-term="searchTerm">
    <ComboboxAnchor>
      <ComboboxTrigger as-child>
        <Button variant="outline" size="sm" class="h-8 gap-2">
          <Plus class="size-4" />
          {{ t("添加内容节点") }}
        </Button>
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxList class="w-80">
      <ComboboxInput :placeholder="t('搜索内容节点...')" />
      <ComboboxEmpty>{{ t("未找到内容节点") }}</ComboboxEmpty>
      <ComboboxItem
        v-for="node in availableNodes"
        :key="node.id"
        :value="node.id"
        @select="handleSelect(node)"
      >
        <div class="flex min-w-0 flex-col">
          <span class="truncate">{{ node.label }}</span>
          <span class="truncate text-xs text-muted-foreground">
            {{ node.path.map((item) => item.label).join(" / ") }}
          </span>
        </div>
      </ComboboxItem>
    </ComboboxList>
  </Combobox>
</template>
