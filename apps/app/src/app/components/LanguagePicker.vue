<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useLanguageStore } from "@/app/stores/language.ts";
import { useI18n } from "vue-i18n";
import Picker from "@/app/components/picker/Picker.vue";

const props = withDefaults(
  defineProps<{
    filter?: (option: { value: string; content: string }) => boolean;
  }>(),
  {
    filter: () => true,
  },
);

const { t } = useI18n();

const { languages } = storeToRefs(useLanguageStore());

const languageId = defineModel<string | null>({ default: null });

const options = computed(() => {
  return languages.value
    .map((language) => {
      return {
        content: t(language.id),
        value: language.id,
      };
    })
    .filter((option) => props.filter(option));
});
</script>

<template>
  <Picker v-model="languageId" :options :placeholer="t('选择一个语言...')" />
</template>
