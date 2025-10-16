<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import { toShortFixed } from "@cat/shared/utils";
import { useI18n } from "vue-i18n";
import Modal from "./headless/HModal.vue";
import RangeInput from "./RangeInput.vue";
import HToggle from "./headless/HToggle.vue";
import InputLabel from "@/app/components/InputLabel.vue";
import { useProfileStore } from "@/app/stores/profile.ts";

const { t } = useI18n();

const { editorMemoryMinSimilarity, editorMemoryAutoCreateMemory } =
  storeToRefs(useProfileStore());

const isOpen = ref(false);
</script>

<template>
  <button
    class="icon-[mdi--cog] bg-highlight-content aspect-ratio-square cursor-pointer hover:bg-highlight-content-darker hover:scale-110"
    @click="isOpen = !isOpen"
  />
  <Modal
    v-model="isOpen"
    :classes="{
      modal: 'modal',
      'modal-backdrop': 'modal-backdrop',
    }"
  >
    <div class="flex flex-col gap-1">
      <InputLabel>{{
        t("最低记忆匹配度 {similarity}%", {
          similarity: toShortFixed(editorMemoryMinSimilarity * 100),
        })
      }}</InputLabel>
      <RangeInput
        v-model="editorMemoryMinSimilarity"
        :min="0"
        :max="1"
        :step="0.001"
      />
    </div>
    <div class="flex flex-col gap-1">
      <InputLabel>{{ t("翻译时保留记忆") }}</InputLabel>
      <HToggle
        v-model="editorMemoryAutoCreateMemory"
        :classes="{
          'base-checked': 'toggle toggle-md toggle-base',
          'base-unchecked': 'toggle toggle-md toggle-highlight-darker',
          'thumb-checked':
            'toggle-thumb toggle-thumb-md toggle-thumb-highlight toggle-thumb-checked',
          'thumb-unchecked':
            'toggle-thumb toggle-thumb-md toggle-thumb-highlight',
        }"
      /></div
  ></Modal>
</template>
