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
  <div class="prose-sm" v-html="compiled" />
</template>
