<script setup lang="ts">
import type { Project } from "@cat/shared/schema/prisma/project";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import CreateProject from "./CreateProject.vue";
import UploadFiles from "./UploadFiles.vue";
import Finish from "./Finish.vue";
import type { FlowItem } from "@/app/components/flow/index.ts";
import { useToastStore } from "@/app/stores/toast.ts";
import TextFlow from "@/app/components/flow/TextFlow.vue";

const { t } = useI18n();

const { warn } = useToastStore();

const progress = ref<number>(0);

const project = ref<Project>();

const items = ref<FlowItem[]>([
  {
    content: `为项目起名`,
  },
  {
    content: `上传要翻译的文件`,
  },
  {
    content: `完成`,
  },
]);

const onProgressChange = (from: number, to: number): number => {
  if (from === 0 && !project.value) {
    warn("你需要先创建项目才能继续");
    return 0;
  } else if (to === 0 && project.value) {
    return from;
  }
  return to;
};
</script>

<template>
  <h1 class="text-2xl font-bold flex gap-2 items-center">
    <div class="i-mdi:cog-outline duration-3000 animate-spin" />
    {{ t("初始化项目") }}
  </h1>
  <div
    class="pb-2 pr-2 border-b-3 border-highlight-content border-dotted w-full md:max-w-screen-sm"
  >
    你正在创建一个<span class="font-bold">纯文本文件</span
    >的翻译项目<br />你需要完成以下任务：<TextFlow
      v-model:progress="progress"
      :on-progress-change
      :items
    />
  </div>
  <CreateProject
    v-if="progress === 0"
    v-model:project="project"
    v-model:progress="progress"
  />
  <UploadFiles
    v-if="progress === 1"
    v-model:project="project"
    v-model:progress="progress"
  />
  <Finish v-if="progress === 2" v-model:project="project" />
</template>

<style scoped>
.animate-spin {
  animation: spin 5s linear infinite;
}
</style>
