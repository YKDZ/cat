<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import TextTagger from "./tagger/TextTagger.vue";
import type { PartData } from "./tagger";

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
