<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useLanguageStore } from "../stores/language";
import type { PickerOption } from "./picker";
import MultiPicker from "./picker/MultiPicker.vue";

const props = withDefaults(
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

const languageIds = defineModel<string[]>("languageIds");

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
    v-model:model-value="languageIds"
    :width
    :options
    :filter
    placeholder="选择一个或多个语言"
  />
</template>
