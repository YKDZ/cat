<script setup lang="ts">
import Button from "@/app/components/Button.vue";
import type { Project } from "@cat/shared";
import { navigate } from "vike/client/router";

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
    <Button icon="i-mdi:check" @click="handleClick">前往项目界面</Button>
  </div>
</template>
