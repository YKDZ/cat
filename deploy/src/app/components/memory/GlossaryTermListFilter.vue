<script setup lang="ts">
import { ref } from "vue";
import LanguagePicker from "@/app/components/LanguagePicker.vue";
import Icon from "@/app/components/Icon.vue";
import Button from "@/app/components/Button.vue";
import { TermListFilterOptions } from ".";

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
    <Button icon="i-mdi:filter" no-text @click="emits('filter', options)" />
  </div>
</template>
