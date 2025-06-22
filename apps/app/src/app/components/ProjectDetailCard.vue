<script setup lang="ts">
import { inject } from "vue";
import { projectKey } from "../utils/provide";
import { useDateFormat } from "@vueuse/core";

const project = inject(projectKey);
</script>

<template>
  <div
    v-if="project"
    class="px-5 py-4 rounded-xl bg-highlight-darker text-nowrap"
  >
    <h3 class="font-bold pb-4 flex gap-5 w-full items-center justify-between">
      {{ $t("项目详情") }}
    </h3>
    <p class="text-sm line-height-loose flex gap-3 justify-between">
      ID <span>{{ project.id }}</span>
    </p>
    <p class="text-sm line-height-loose flex justify-between">
      名称 <span>{{ project.name }}</span>
    </p>
    <p
      v-if="project.description?.trim().length !== 0"
      class="text-sm line-height-loose flex justify-between"
    >
      描述 <span>{{ project.description }}</span>
    </p>
    <p class="text-sm line-height-loose flex justify-between">
      源语言 <span>{{ project?.SourceLanguage?.name }}</span>
    </p>
    <p class="text-sm line-height-loose flex justify-between">
      创建于
      <span>{{ useDateFormat(project.createdAt, "YYYY-MM-DD HH:mm") }}</span>
    </p>
  </div>
</template>
