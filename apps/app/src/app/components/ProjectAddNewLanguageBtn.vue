<script setup lang="ts">
import { warn } from "node:console";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { trpc } from "@cat/app-api/trpc/client";
import type { Project } from "@cat/shared/schema/prisma/project";
import type { Language } from "@cat/shared/schema/prisma/misc";
import type { PickerOption } from "./picker/index.ts";
import HButton from "./headless/HButton.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import LanguagePicker from "@/app/components/LanguagePicker.vue";

const { t } = useI18n();

const { trpcWarn } = useToastStore();

const props = defineProps<{
  project: Project & {
    TargetLanguages: Language[];
    SourceLanguage: Language;
  };
}>();

const languageId = ref<string>("");

const addNewLanguage = () => {
  if (languageId.value === "") {
    warn("你还没有选择语言");
    return;
  }
  if (
    props.project.TargetLanguages?.find(
      (language) => language.id === languageId.value,
    )
  ) {
    warn("该语言已存在");
    return;
  }

  trpc.project.addNewLanguage
    .mutate({
      projectId: props.project.id,
      languageId: languageId.value,
    })
    .catch(trpcWarn);
};

const langFilter = (option: PickerOption) => {
  return (
    option.value !== props.project.SourceLanguage.id &&
    !props.project.TargetLanguages.map((language) => language.id).includes(
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
