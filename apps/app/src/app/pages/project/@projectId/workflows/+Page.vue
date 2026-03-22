<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { useI18n } from "vue-i18n";

import type { Data } from "./+data.server.ts";

import WorkflowRunList from "./WorkflowRunList.vue";

const { t } = useI18n();
const { runs, projectId } = useData<Data>();
</script>

<template>
  <h1 class="mb-6 text-2xl font-bold">{{ t("项目工作流记录") }}</h1>

  <WorkflowRunList
    v-if="runs.length > 0"
    :runs="runs"
    :project-id="projectId"
  />

  <div
    v-else
    class="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center"
  >
    <p class="text-muted-foreground">{{ t("暂无任何工作流") }}</p>
  </div>
</template>
