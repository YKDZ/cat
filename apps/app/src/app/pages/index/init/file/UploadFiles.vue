<script setup lang="ts">
import Button from "@/app/components/Button.vue";
import ProjectUploadFiles from "@/app/components/ProjectUploadFiles.vue";
import type { Project } from "@cat/shared";
import { ref } from "vue";

const progress = defineModel("progress", { type: Number, required: true });
const project = defineModel<Project>("project");

const isProcessing = ref<boolean>(false);
</script>

<template>
  <!-- Upload File -->
  <ProjectUploadFiles v-if="project" v-model:project="project" />
  <Button
    icon="i-mdi:clock"
    class="justify-self-stretch"
    :is-processing
    @click="progress += 1"
    >先不上传文件</Button
  >
</template>
