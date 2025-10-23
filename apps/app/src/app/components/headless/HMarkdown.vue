<script setup lang="ts">
import { computed } from "vue";
import { setOptions, marked } from "marked";

type Classes = {
  container?: string;
};

const props = defineProps<{ content: string; classes?: Classes }>();

setOptions({
  breaks: true,
});

const compiled = computed(() => marked(props.content));
</script>

<template>
  <div :class="[classes?.container]" v-html="compiled" />
</template>
