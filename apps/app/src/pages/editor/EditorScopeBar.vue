<script setup lang="ts">
import { Badge, Button } from "@cat/ui";
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";

import TextTooltip from "@/components/tooltip/TextTooltip.vue";
import { useEditorContextStore } from "@/stores/editor/context";

import ContentNodeFilterPicker from "./ContentNodeFilterPicker.vue";
import { buildEditorHref } from "./scope-url";

const { t } = useI18n();
const contextStore = useEditorContextStore();
const { scope, contentNodeFilters } = storeToRefs(contextStore);

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
  <div class="flex flex-wrap items-center gap-2 text-sm">
    <Badge
      v-for="filter in contentNodeFilters"
      :key="filter.id"
      variant="secondary"
      class="gap-1"
    >
      <span>{{ filter.path.map((item) => item.label).join(" / ") }}</span>
      <button
        class="icon-[mdi--close] size-3"
        type="button"
        :aria-label="t('移除内容节点过滤器')"
        @click="removeFilter(filter.id)"
      />
    </Badge>
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
