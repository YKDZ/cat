<script setup lang="ts">
import type { EditorContentNodeFilter } from "@cat/shared";

import { Badge, Button } from "@cat/ui";
import { useQuery } from "@pinia/colada";
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import TextTooltip from "@/components/tooltip/TextTooltip.vue";
import { orpc } from "@/rpc/orpc";
import { useEditorContextStore } from "@/stores/editor/context";

import ContentNodeFilterPicker from "./ContentNodeFilterPicker.vue";
import { buildEditorHref } from "./scope-url";

const { t } = useI18n();
const contextStore = useEditorContextStore();
const { scope, contentNodeFilters } = storeToRefs(contextStore);

// Same query key as ContentNodeFilterPicker — Pinia Colada deduplicates the request.
const { state: contentNodeState, isPending } = useQuery({
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

// Show the filter UI only when there are multiple filterable nodes.
// While loading (isPending), default to visible to avoid a flash of hidden content
// on projects that do have multiple nodes.
const hasMultipleContentNodes = computed(
  () => isPending.value || (contentNodeState.value.data ?? []).length > 1,
);

const removeFilter = async (id: string) => {
  if (!scope.value) return;
  contextStore.clearContentNodeFilter(id);
  if (contextStore.scope) {
    await navigate(buildEditorHref(contextStore.scope, "auto"));
  }
};

const clearFilters = async () => {
  if (!scope.value) return;
  contextStore.setContentNodeFilters([]);
  if (contextStore.scope) {
    await navigate(buildEditorHref(contextStore.scope, "auto"));
  }
};
</script>

<template>
  <div
    v-if="hasMultipleContentNodes"
    class="flex min-w-0 items-center gap-2 text-sm"
  >
    <div
      v-if="contentNodeFilters.length > 0"
      class="flex min-w-0 items-center gap-1 overflow-x-auto"
    >
      <Badge
        v-for="filter in contentNodeFilters"
        :key="filter.id"
        variant="secondary"
        class="shrink-0 gap-1"
      >
        <span>{{ filter.path.map((item) => item.label).join(" / ") }}</span>
        <button
          class="icon-[mdi--close] size-3"
          type="button"
          :aria-label="t('移除内容节点过滤器')"
          @click="removeFilter(filter.id)"
        />
      </Badge>
    </div>
    <ContentNodeFilterPicker />
    <TextTooltip
      v-if="contentNodeFilters.length > 0"
      :tooltip="t('查看整个项目')"
      side="bottom"
    >
      <Button variant="ghost" size="icon" class="size-8" @click="clearFilters">
        <div class="icon-[mdi--filter-remove-outline] size-4" />
      </Button>
    </TextTooltip>
  </div>
</template>
