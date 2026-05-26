<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import type { Data } from "./+data.server.ts";

import ProjectPageDataError from "../ProjectPageDataError.vue";
import WorkflowRunList from "./WorkflowRunList.vue";

const { t } = useI18n();
const data = useData<Data>();
const pageError = computed(() => data.pageError);
const runs = computed(() => data.runs ?? []);
const projectId = computed(
  () => data.projectId ?? data.projectShell.project.id,
);
</script>

<template>
  <ProjectPageDataError v-if="pageError" :message="pageError.message" />
  <template v-else>
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
</template>
