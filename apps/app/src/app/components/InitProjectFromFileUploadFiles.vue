<script setup lang="ts">
import type { Project } from "@cat/shared/schema/drizzle/project";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import ProjectUploadFiles from "@/app/components/ProjectUploadFiles.vue";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/app/components/ui/spinner";

const { t } = useI18n();

const progress = defineModel("progress", { type: Number, required: true });
const project = defineModel<Project>("project");

const isProcessing = ref<boolean>(false);
</script>

<template>
  <ProjectUploadFiles v-if="project" v-model:project="project" />
  <Button :loading="isProcessing" @click="progress += 1">
    <Spinner v-if="isProcessing" />
    <div v-else class="icon-[mdi--clock] size-4" />
    {{ t("先不上传文件") }}</Button
  >
</template>
