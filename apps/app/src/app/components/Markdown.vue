<script setup lang="ts">
import { computed } from "vue";
import { setOptions, marked } from "marked";

const props = defineProps<{
  content: string;
}>();

setOptions({
  breaks: true,
});

const compiled = computed(() => marked(props.content));
</script>

<template>
  <div class="markdown prose-sm" v-html="compiled" />
</template>

<style lang="css" scoped>
.markdown {
  text-autospace: normal;
}

/* Allow wide tables to scroll horizontally instead of overflowing the viewport */
.markdown :deep(table) {
  display: block;
  overflow-x: auto;
  max-width: 100%;
}
</style>
