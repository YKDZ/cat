<script setup lang="ts">
import type { Project } from "@cat/shared/schema/drizzle/project";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import ProjectUploadFiles from "@/app/components/ProjectUploadFiles.vue";
import HButton from "@/app/components/headless/HButton.vue";

const { t } = useI18n();

const progress = defineModel("progress", { type: Number, required: true });
const project = defineModel<Project>("project");

const isProcessing = ref<boolean>(false);
</script>

<template>
  <ProjectUploadFiles v-if="project" v-model:project="project" />
  <HButton
    icon="i-mdi:clock"
    :classes="{
      base: 'btn btn-md btn-base',
    }"
    :loading="isProcessing"
    @click="progress += 1"
    >{{ t("先不上传文件") }}</HButton
  >
</template>
