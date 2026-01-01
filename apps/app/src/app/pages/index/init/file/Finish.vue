<script setup lang="ts">
import type { Project } from "@cat/shared/schema/drizzle/project";
import { navigate } from "vike/client/router";
import { Button } from "@/app/components/ui/button";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const project = defineModel<Project>("project");

const handleClick = async () => {
  if (!project.value) return;
  await navigate(`/project/${project.value.id}`);
};
</script>

<template>
  <div class="flex flex-col">
    <h2 class="text-lg font-bold">{{ t("成功创建项目！") }}</h2>
    <p>{{ t("现在你可以开始翻译工作了") }}</p>
    <Button @click="handleClick"
      ><div class="icon-[mdi--check] size-4" />
      {{ t("前往项目界面") }}</Button
    >
  </div>
</template>
