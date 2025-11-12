<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import type { PickerOption } from "./picker/index.ts";
import MultiPicker from "./picker/MultiPicker.vue";
import { useLanguageStore } from "@/app/stores/language.ts";
import { useI18n } from "vue-i18n";

const props = withDefaults(
  defineProps<{
    filter?: (option: PickerOption) => boolean;
  }>(),
  {
    filter: () => true,
  },
);

const { t } = useI18n();

const { languages } = storeToRefs(useLanguageStore());

const languageIds = defineModel<string[]>();

const options = computed(() => {
  return languages.value
    .filter((language) =>
      props.filter({
        value: language.id,
        content: t(language.id),
      }),
    )
    .map((language) => {
      return {
        value: language.id,
        content: t(language.id),
      };
    });
});
</script>

<template>
  <MultiPicker
    v-model="languageIds"
    :options
    :placeholder="$t('选择一个或多个语言')"
  />
</template>
