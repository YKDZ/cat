<script setup lang="ts">
import HButton from "@/app/components/headless/HButton.vue";
import Input from "@/app/components/Input.vue";
import InputLabel from "@/app/components/InputLabel.vue";
import LanguagePicker from "@/app/components/LanguagePicker.vue";
import { useProjectStore } from "@/app/stores/project";
import { projectKey } from "@/app/utils/provide";
import { trpc } from "@/server/trpc/client";
import { navigate } from "vike/client/router";
import { inject, ref } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const project = inject(projectKey);
const { deleteProject } = useProjectStore();

const name = ref(project!.value!.name);
const sourceLanguageId = ref(project!.value!.sourceLanguageId);

const updateName = async () => {
  if (!project || !project.value) return;
  update(project.value.id, { name: name.value });
};

const updateSourceLanguageId = async () => {
  if (!project || !project.value) return;
  update(project.value.id, { sourceLanguageId: sourceLanguageId.value });
};

const update = async (
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

const remove = async () => {
  if (!project || !project.value) return;

  await trpc.project.delete.mutate({ id: project.value.id });
  deleteProject(project.value.id);

  await navigate("/projects");
};
</script>

<template>
  <h1>{{ t("通用") }}</h1>
  <h2>{{ t("项目信息") }}</h2>
  <div>
    <InputLabel>{{ t("项目名称") }}</InputLabel>
    <div class="flex gap-1 items-center">
      <Input v-model="name" small />
      <HButton
        :classes="{
          base: 'btn btn-md btn-base',
        }"
        @click="updateName"
      >
        {{ t("重命名") }}
      </HButton>
    </div>
    <InputLabel>{{ t("项目源语言") }}</InputLabel>
    <div class="flex gap-1 items-center">
      <LanguagePicker v-model="sourceLanguageId" />
      <HButton
        :classes="{
          base: 'btn btn-md btn-base',
        }"
        @click="updateSourceLanguageId"
      >
        {{ t("更改") }}
      </HButton>
    </div>
    <HButton
      :classes="{
        base: 'btn btn-md btn-base',
      }"
      @click="remove"
      >{{ t("删除项目") }}</HButton
    >
  </div>
</template>
