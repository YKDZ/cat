<script setup lang="ts">
import Button from "@/app/components/Button.vue";
import { Project } from "@cat/shared";
import { navigate } from "vike/client/router";

const project = defineModel<Project>("project");
</script>

<template>
  <div class="flex flex-col">
    <h2 class="text-lg font-bold">成功创建项目！</h2>
    <p>现在你可以开始翻译工作了</p>
    <Button
      icon="i-mdi:check"
      @click="project && navigate(`/project/${project.id}`)"
      >前往项目界面</Button
    >
  </div>
</template>
