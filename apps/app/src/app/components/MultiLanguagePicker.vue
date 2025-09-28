<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import type { PickerOption } from "./picker/index.ts";
import MultiPicker from "./picker/MultiPicker.vue";
import { useLanguageStore } from "@/app/stores/language.ts";

withDefaults(
  defineProps<{
    filter?: (option: PickerOption) => boolean;
    width?: string;
  }>(),
  {
    filter: () => true,
    width: "fit-content",
  },
);

const { languages } = storeToRefs(useLanguageStore());

const languageIds = defineModel<string[]>();

const options = computed(() => {
  return languages.value.map((language) => {
    return {
      value: language.id,
      content: language.name,
    };
  });
});
</script>

<template>
  <MultiPicker
    v-model="languageIds"
    :width
    :options
    :filter
    :placeholder="$t('选择一个或多个语言')"
  />
</template>
