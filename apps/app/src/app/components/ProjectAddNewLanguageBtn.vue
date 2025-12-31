<script setup lang="ts">
import { warn } from "node:console";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { orpc } from "@/server/orpc";
import type { Project } from "@cat/shared/schema/drizzle/project";
import type { Language } from "@cat/shared/schema/drizzle/misc";
import type { PickerOption } from "./picker/index.ts";
import { useToastStore } from "@/app/stores/toast.ts";
import LanguagePicker from "@/app/components/LanguagePicker.vue";
import { Button } from "@/app/components/ui/button/index.ts";

const { t } = useI18n();

const { rpcWarn } = useToastStore();

const props = defineProps<{
  project: Project & {
    TargetLanguages: Language[];
    SourceLanguage: Language;
  };
}>();

const languageId = ref<string>("");

const addTargetLanguages = () => {
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

  orpc.project
    .addTargetLanguages({
      projectId: props.project.id,
      languageId: languageId.value,
    })
    .catch(rpcWarn);
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
  <Button :disabled="languageId === ``" @click="addTargetLanguages"
    ><div class="icon-[mdi--plus] size-4" />
    {{ t("添加新语言并开始翻译") }}</Button
  >
</template>
