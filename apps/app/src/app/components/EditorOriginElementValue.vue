<script setup lang="ts">
import { storeToRefs } from "pinia";
import TextTagger from "./tagger/TextTagger.vue";
import type { PartData } from "./tagger/index.ts";
import { useEditorStore } from "@/app/stores/editor.ts";

const { element, sourceParts } = storeToRefs(useEditorStore());

const handleUpdate = (_: PartData[] | undefined, to: PartData[]) => {
  sourceParts.value = to;
};
</script>

<template>
  <div class="text-lg mb-6">
    <TextTagger
      v-if="element"
      :text="element.value"
      interactable
      @update="handleUpdate"
    />
  </div>
</template>
