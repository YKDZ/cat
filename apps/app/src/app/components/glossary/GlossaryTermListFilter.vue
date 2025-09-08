<script setup lang="ts">
import { ref } from "vue";
import LanguagePicker from "@/app/components/LanguagePicker.vue";
import Icon from "@/app/components/Icon.vue";

import type { TermListFilterOptions } from ".";
import HButton from "../headless/HButton.vue";

const emits = defineEmits<{
  (e: "filter", options: TermListFilterOptions): void;
}>();

const options = ref<TermListFilterOptions>({
  sourceLanguageId: null,
  translationLanguageId: null,
});
</script>

<template>
  <div class="flex gap-2 items-center">
    <LanguagePicker v-model="options.sourceLanguageId" />
    <Icon icon="i-mdi:arrow-right" />
    <LanguagePicker v-model="options.translationLanguageId" />
    <HButton
      :classes="{
        base: 'btn btn-md btn-base btn-square',
      }"
      icon="i-mdi:filter"
      no-text
      @click="emits('filter', options)"
    />
  </div>
</template>
