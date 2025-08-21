<script setup lang="ts">
import { ref } from "vue";
import Modal from "./Modal.vue";
import InputLabel from "@/app/components/InputLabel.vue";
import RangeInput from "./RangeInput.vue";
import { storeToRefs } from "pinia";
import { useProfileStore } from "../stores/profile";
import { toShortFixed } from "@cat/shared";
import Toggler from "./Toggler.vue";

const { editorMemoryMinSimilarity, editorMemoryAutoCreateMemory } =
  storeToRefs(useProfileStore());

const isOpen = ref(false);
</script>

<template>
  <button
    class="i-mdi:cog bg-highlight-content aspect-ratio-square cursor-pointer hover:bg-highlight-content-darker hover:scale-110"
    @click="isOpen = !isOpen"
  />
  <Modal v-model:is-open="isOpen">
    <div class="px-10 py-6 rounded-sm bg-highlight">
      <div class="flex flex-col gap-1">
        <InputLabel>{{
          $t("最低记忆匹配度 {similarity}%", {
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
        <InputLabel>{{ $t("翻译时保留记忆") }}</InputLabel>
        <Toggler v-model="editorMemoryAutoCreateMemory" />
      </div></div
  ></Modal>
</template>
