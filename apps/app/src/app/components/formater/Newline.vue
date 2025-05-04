<script setup lang="ts">
import { useEditorStore } from "@/app/stores/editor";

const { insertToSelection } = useEditorStore();

const handleInsert = () => {
  insertToSelection("\n");
};
</script>

<template>
  <span
    class="mr-0.5 rounded-md bg-gray-200 cursor-pointer hover:bg-gray-300"
    @click="handleInsert"
  >
    <span class="i-codicon:newline text-black inline-block"
  /></span>
</template>
