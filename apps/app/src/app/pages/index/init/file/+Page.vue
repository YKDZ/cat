<script setup lang="ts">
import type { Project } from "@cat/shared/schema/drizzle/project";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import CreateProject from "@/app/components/InitProjectFromFileCreateProject.vue";
import UploadFiles from "@/app/components/InitProjectFromFileUploadFiles.vue";
import Finish from "@/app/components/InitProjectFromFileFinish.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { Settings } from "lucide-vue-next";
import Separator from "@/app/components/ui/separator/Separator.vue";
import { watchClient } from "@/app/utils/vue";

const { t } = useI18n();

const { warn } = useToastStore();

const progress = ref<number>(0);

const project = ref<Project>();

watchClient(progress, (to, from) => {
  if (from === 0 && !project.value) {
    warn("你需要先创建项目才能继续");
    return 0;
  } else if (to === 0 && project.value) {
    return from;
  }
  return to;
});
</script>

<template>
  <h1 class="text-2xl font-bold flex gap-2 items-center">
    <Settings />
    {{ t("初始化项目") }}
  </h1>
  <Separator />
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
