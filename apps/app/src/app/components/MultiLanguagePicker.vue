<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useLanguageStore } from "../stores/language";
import { PickerOption } from "./picker";
import MultiPicker from "./picker/MultiPicker.vue";

interface Props {
  filter?: (option: PickerOption) => boolean;
  fullWidth?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  filter: () => true,
});

const { languages } = storeToRefs(useLanguageStore());

const languageIds = defineModel<string[]>("languageIds");

const options = computed(() => {
  return languages.value
    .map((language) => {
      return {
        value: language.id,
        content: language.name,
      };
    })
    .filter((option) => props.filter(option));
});
</script>

<template>
  <MultiPicker
    v-model:model-value="languageIds"
    :full-width
    :options
    placeholder="搜索或选择一个或多个语言"
  />
</template>
