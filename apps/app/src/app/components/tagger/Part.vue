<script setup lang="ts">
import { computed, h } from "vue";
import type { PartData } from ".";
import { clippers } from ".";

const props = defineProps<{ part: PartData; interactable: boolean }>();

const clipper = computed(() =>
  clippers.value.find((c) => c.id === props.part.clipperId),
);

// i-codicon:newline

const content = computed(() => {
  if (!clipper.value?.content) {
    return props.part.text;
  } else if (typeof clipper.value.content === "string") {
    if (clipper.value.content.startsWith("i-")) {
      // 图标
      return h("span", { class: `${clipper.value.content} inline-block` });
    } else {
      return clipper.value.content;
    }
  } else {
    return clipper.value.content(props.part);
  }
});

const isString = computed(() => typeof content.value === "string");

const handleClick = () => {
  if (!props.interactable || !clipper.value?.onClick) return;

  clipper.value.onClick(props.part);
};
</script>

<template>
  <span
    :class="{
      'bg-highlight-darkest cursor-pointer text-highlight-content p-0.5 rounded-md':
        !!clipper && clipper.highlight,
      'hover:bg-highlight-darkest cursor-pointer':
        !!clipper?.onClick && interactable,
    }"
    @click="handleClick"
  >
    <template v-if="isString">{{ content }}</template>
    <template v-else>
      <component :is="content" />
    </template>
  </span>
</template>
