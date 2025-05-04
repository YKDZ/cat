<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import Render from "./formater/Render.vue";

const { element, document } = storeToRefs(useEditorStore());
</script>

<template>
  <div class="text-lg mb-6">
    <Render
      v-if="element && document"
      :type="document.Type"
      :text="element.value"
    />
  </div>
</template>
