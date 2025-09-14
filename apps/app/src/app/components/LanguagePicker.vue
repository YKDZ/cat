<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import Picker from "./picker/Picker.vue";
import type { PickerOption } from "./picker/index.ts";
import { useLanguageStore } from "@/app/stores/language.ts";

interface Props {
  filter?: (option: PickerOption) => boolean;
  fullWidth?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  filter: () => true,
  fullWidth: false,
});

const { languages } = storeToRefs(useLanguageStore());

const languageId = defineModel<string | null>({ default: null });

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
  <Picker
    v-model="languageId"
    :full-width
    :options
    :placeholder="$t('选择一个语言')"
  />
</template>
