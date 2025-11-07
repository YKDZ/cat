<script setup lang="ts">
import { computed, h } from "vue";
import type { PartData } from "./index.ts";
import { clippers } from "./index.ts";

const props = withDefaults(
  defineProps<{ part: PartData; interactive: boolean; layerIndex?: number }>(),
  {
    layerIndex: 0,
  },
);

const clipper = computed(() =>
  clippers.value.find((c) => c.id === props.part.clipperId),
);

const content = computed(() => {
  if (!clipper.value?.content) {
    return props.part.text;
  } else if (typeof clipper.value.content === "string") {
    return clipper.value.content;
  } else {
    return clipper.value.content(props.part);
  }
});

const isString = computed(() => typeof content.value === "string");

const handleClick = () => {
  if (
    !props.interactive ||
    !clipper.value ||
    clipper.value?.clickHandlers.length === 0
  )
    return;
  clipper.value.clickHandlers.forEach(({ handler }) =>
    handler(clipper.value!, props.part),
  );
};

const bgColor = computed(() => {
  return `bg-gray-${props.layerIndex + 2}00`;
});

const bgHoverColor = computed(() => {
  return `hover:bg-gray-${props.layerIndex + 3}00`;
});

// bg-gray-200
// bg-gray-300
// bg-gray-400
// bg-gray-500
// bg-gray-600
// bg-gray-700
// bg-gray-800
// bg-gray-900

// hover:bg-gray-200
// hover:bg-gray-300
// hover:bg-gray-400
// hover:bg-gray-500
// hover:bg-gray-600
// hover:bg-gray-700
// hover:bg-gray-800
// hover:bg-gray-900

// i-codicon:newline
</script>

<template>
  <span
    :class="[
      {
        'cursor-pointer text-highlight-content px-0.5':
          !!clipper && clipper.highlight,
        'cursor-pointer':
          clipper && clipper.clickHandlers.length > 0 && interactive,
        'pointer-events-none': !interactive,
      },
      !!clipper && clipper.highlight && bgColor,
      clipper &&
        clipper.clickHandlers.length > 0 &&
        interactive &&
        bgHoverColor,
    ]"
    :style="{
      zIndex: 10 + layerIndex,
    }"
    @click.stop="handleClick"
    ><span v-if="part.subParts.length === 0">
      <span v-if="isString" class="whitespace-pre">{{ content }}</span>
      <template v-else> <component :is="content" /> </template
    ></span>
    <span v-else>
      <Part
        v-for="subPart in part.subParts"
        :key="subPart.text"
        :part="subPart"
        :interactive
        :layer-index="layerIndex + 1"
    /></span>
  </span>
</template>
