<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import Render from "./formater/Render.vue";
import type { PartData } from "./formater";

const { element, document, sourceParts } = storeToRefs(useEditorStore());

const handleUpdate = (from: PartData[] | undefined, to: PartData[]) => {
  sourceParts.value = to;
};
</script>

<template>
  <div class="text-lg mb-6">
    <Render
      v-if="element && document"
      :text="element.value"
      interactable
      @update="handleUpdate"
    />
  </div>
</template>
