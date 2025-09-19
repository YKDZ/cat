<script setup lang="ts">
import type { Project } from "@cat/shared/schema/prisma/project";
import { navigate } from "vike/client/router";
import HButton from "@/app/components/headless/HButton.vue";

const project = defineModel<Project>("project");

const handleClick = async () => {
  if (!project.value) return;
  await navigate(`/project/${project.value.id}`);
};
</script>

<template>
  <div class="flex flex-col">
    <h2 class="text-lg font-bold">成功创建项目！</h2>
    <p>现在你可以开始翻译工作了</p>
    <HButton
      :classes="{
        base: 'btn btn-md btn-base',
      }"
      icon="i-mdi:check"
      @click="handleClick"
      >前往项目界面</HButton
    >
  </div>
</template>
