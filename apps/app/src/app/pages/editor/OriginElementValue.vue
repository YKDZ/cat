<script setup lang="ts">
import { storeToRefs } from "pinia";
import TextTagger from "@/app/components/tagger/TextTagger.vue";
import type { PartData } from "@/app/components/tagger";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";

const { element, sourceParts } = storeToRefs(useEditorTableStore());

const handleUpdate = (_: PartData[] | undefined, to: PartData[]) => {
  sourceParts.value = to;
};
</script>

<template>
  <TextTagger
    v-if="element"
    :text="element.value"
    interactable
    @update="handleUpdate"
  />
</template>
