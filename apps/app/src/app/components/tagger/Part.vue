<script setup lang="ts">
import { computed, h } from "vue";
import type { PartData } from ".";
import { clippers } from ".";

const props = withDefaults(
  defineProps<{ part: PartData; interactable: boolean; layerIndex?: number }>(),
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
  if (
    !props.interactable ||
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
          clipper && clipper.clickHandlers.length > 0 && interactable,
        'pointer-events-none': !interactable,
      },
      !!clipper && clipper.highlight && bgColor,
      clipper &&
        clipper.clickHandlers.length > 0 &&
        interactable &&
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
        :interactable
        :layer-index="layerIndex + 1"
    /></span>
  </span>
</template>
