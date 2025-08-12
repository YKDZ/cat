<script setup lang="ts">
import Button from "@/app/components/Button.vue";
import Input from "@/app/components/Input.vue";
import InputLabel from "@/app/components/InputLabel.vue";
import LanguagePicker from "@/app/components/LanguagePicker.vue";
import MultiLanguagePicker from "@/app/components/MultiLanguagePicker.vue";
import { projectKey } from "@/app/utils/provide";
import { trpc } from "@/server/trpc/client";
import { inject, ref } from "vue";

const project = inject(projectKey);

const name = ref(project!.value!.name);
const sourceLanguageId = ref(project!.value!.sourceLanguageId);
const targetLanguageIds = ref(
  project!.value!.TargetLanguages?.map((lang) => lang.id) || [],
);

const updateName = async () => {
  if (!project || !project.value) return;
  updateProject(project.value.id, { name: name.value });
};

const updateSourceLanguageId = async () => {
  if (!project || !project.value) return;
  updateProject(project.value.id, { sourceLanguageId: sourceLanguageId.value });
};

const updateTargetLanguageIds = async () => {
  if (!project || !project.value) return;
  updateProject(project.value.id, {
    targetLanguageIds: targetLanguageIds.value,
  });
};

const updateProject = async (
  id: string,
  {
    name,
    sourceLanguageId,
    targetLanguageIds,
  }: {
    name?: string;
    sourceLanguageId?: string;
    targetLanguageIds?: string[];
  } = {},
) => {
  if (!project || !project.value) return;

  await trpc.project.update.mutate({
    id,
    name,
    sourceLanguageId,
    targetLanguageIds,
  });
};
</script>

<template>
  <h1>{{ $t("通用") }}</h1>
  <h2>{{ $t("项目信息") }}</h2>
  <div>
    <InputLabel>{{ $t("项目名称") }}</InputLabel>
    <div class="flex gap-1 items-center">
      <Input v-model="name" small />
      <Button @click="updateName">
        {{ $t("重命名") }}
      </Button>
    </div>
    <InputLabel>{{ $t("项目源语言") }}</InputLabel>
    <div class="flex gap-1 items-center">
      <LanguagePicker v-model="sourceLanguageId" />
      <Button @click="updateSourceLanguageId">
        {{ $t("更改") }}
      </Button>
    </div>
  </div>
</template>
