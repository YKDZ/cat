<script setup lang="ts">
import { Badge, Button } from "@cat/ui";
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { useEditorContextStore } from "@/stores/editor/context";

import ContentNodeFilterPicker from "./ContentNodeFilterPicker.vue";
import { buildEditorHref } from "./scope-url";

const { t } = useI18n();
const contextStore = useEditorContextStore();
const { scope, contentNodeFilters } = storeToRefs(contextStore);

const scopeLabel = computed(() =>
  contentNodeFilters.value.length === 0 ? t("整个项目") : t("内容节点范围"),
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
  <div class="flex flex-wrap items-center gap-2 text-sm">
    <span class="text-muted-foreground">{{ scopeLabel }}</span>
    <Badge v-if="contentNodeFilters.length === 0" variant="secondary">
      {{ t("整个项目") }}
    </Badge>
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
    <Button
      v-if="contentNodeFilters.length > 0"
      variant="ghost"
      size="sm"
      @click="clearFilters"
    >
      {{ t("查看整个项目") }}
    </Button>
  </div>
</template>
