<script setup lang="ts">
import { navigate } from "vike/client/router";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";
import HButton from "@/app/components/headless/HButton.vue";
import Input from "@/app/components/Input.vue";
import InputLabel from "@/app/components/InputLabel.vue";
import LanguagePicker from "@/app/components/LanguagePicker.vue";
import { trpc } from "@/server/trpc/client.ts";

const { t } = useI18n();
const { project } = useData<Data>();
const name = ref(project!.name);
const sourceLanguageId = ref(project!.sourceLanguageId);

const updateName = async (): Promise<void> => {
  if (!project) return;
  update(project.id, { name: name.value });
};

const updateSourceLanguageId = async (): Promise<void> => {
  if (!project) return;
  update(project.id, { sourceLanguageId: sourceLanguageId.value });
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
): Promise<void> => {
  if (!project) return;

  await trpc.project.update.mutate({
    id,
    name,
    sourceLanguageId,
    targetLanguageIds,
  });
};

const remove = async (): Promise<void> => {
  if (!project) return;

  await trpc.project.delete.mutate({ id: project.id });

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
