<script setup lang="ts">
import type { TextTabItem } from "@/app/components/tab/text";
import { useToastStore } from "@/app/stores/toast";
import type { Project } from "@cat/shared";
import { ref } from "vue";
import CreateProject from "./CreateProject.vue";
import UploadFiles from "./UploadFiles.vue";
import Finish from "./Finish.vue";
import TextTab from "@/app/components/tab/text/TextTab.vue";

const { info, warn, zWarn, error } = useToastStore();

const progress = ref<number>(0);

const project = ref<Project>();

const items = ref<TextTabItem[]>([
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
    初始化项目
  </h1>
  <div
    class="pb-2 pr-2 border-b-3 border-highlight-content border-dotted w-full md:max-w-screen-sm"
  >
    你正在创建一个<span class="font-bold">纯文本文件</span
    >的翻译项目<br />你需要完成以下任务：<TextTab
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
