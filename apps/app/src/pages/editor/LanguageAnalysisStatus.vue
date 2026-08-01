<script setup lang="ts">
import type { LanguageAnalysisObservationView } from "@cat/shared";
import { storeToRefs } from "pinia";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "#/rpc/orpc.ts";
import { useEditorContextStore } from "#/stores/editor/context.ts";

const { projectId } = storeToRefs(useEditorContextStore());
const { t } = useI18n();
const views = ref<LanguageAnalysisObservationView[]>([]);

watch(
  projectId,
  async (nextProjectId) => {
    views.value = [];
    if (!nextProjectId) return;
    views.value = await orpc.languageAnalysis.getProjectObservations({
      projectId: nextProjectId,
    });
  },
  { immediate: true },
);
</script>

<template>
  <div
    v-for="view in views.filter(
      (item) => item.assessment.status !== 'SATISFIED',
    )"
    :key="view.languageId"
    class="border-b px-4 py-3 text-sm"
    :class="
      view.assessment.status === 'BLOCKED'
        ? 'border-destructive/40 bg-destructive/10 text-destructive'
        : 'bg-muted text-muted-foreground'
    "
    role="status"
  >
    <span class="font-medium"
      >{{ t("语言分析") }} ({{ view.languageId }}):</span
    >
    <template v-if="view.assessment.blocker">
      {{ view.assessment.blocker.reason }} ·
      {{ view.assessment.blocker.remediation }}
    </template>
    <template v-else>{{ t("未知") }}</template>
  </div>
</template>
