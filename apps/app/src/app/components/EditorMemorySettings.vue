<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import { toShortFixed } from "@cat/shared/utils";
import { useI18n } from "vue-i18n";
import RangeInput from "./RangeInput.vue";
import InputLabel from "@/app/components/InputLabel.vue";
import { useProfileStore } from "@/app/stores/profile.ts";
import SModal from "./headless-styled/SModal.vue";
import SToggle from "./headless-styled/SToggle.vue";

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
  <SModal v-model="isOpen">
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
      <SToggle v-model="editorMemoryAutoCreateMemory" /></div
  ></SModal>
</template>
