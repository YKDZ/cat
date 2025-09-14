<script setup lang="ts">
import { warn } from "node:console";
import { inject, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { PickerOption } from "./picker/index.ts";
import HButton from "./headless/HButton.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { projectKey } from "@/app/utils/provide.ts";
import { trpc } from "@/server/trpc/client.ts";

const { t } = useI18n();

const { trpcWarn } = useToastStore();

const project = inject(projectKey);
const languageId = ref<string>("");

const addNewLanguage = () => {
  if (!project || !project.value) {
    warn("你还没有选择项目");
    return;
  }
  if (languageId.value === "") {
    warn("你还没有选择语言");
    return;
  }
  if (
    project.value.TargetLanguages?.find(
      (language) => language.id === languageId.value,
    )
  ) {
    warn("该语言已存在");
    return;
  }

  trpc.project.addNewLanguage
    .mutate({
      projectId: project.value.id,
      languageId: languageId.value,
    })
    .catch(trpcWarn);
};

const langFilter = (option: PickerOption) => {
  if (!project || !project.value) {
    warn("你还没有选择项目");
    return false;
  }
  return (
    option.value !== project.value.SourceLanguage?.id &&
    !project.value.TargetLanguages?.map((language) => language.id).includes(
      `${option.value}`,
    )
  );
};
</script>

<template>
  <LanguagePicker v-model="languageId" :filter="langFilter" />
  <HButton
    icon="i-mdi:plus"
    :classes="{
      base: 'btn btn-md btn-base',
    }"
    :disabled="languageId === ``"
    @click="addNewLanguage"
    >{{ t("添加新语言并开始翻译") }}</HButton
  >
</template>
