<script setup lang="ts">
import { DocumentType } from "@cat/shared";
import { computed, h } from "vue";
import Newline from "./Newline.vue";
import Empty from "./Empty.vue";

const props = defineProps<{
  type: DocumentType;
  text: string;
}>();

const contentNodes = computed(() => {
  if (!props.text)
    return [
      h(Empty, {
        key: "empty",
      }),
    ];

  const segments = props.text.split(/(\n)/g);

  return segments.map((segment, index) => {
    if (segment === "\n") {
      return h(Newline, {
        key: `nl-${index}`,
      });
    }
    return h(
      "span",
      {
        key: `text-${index}`,
      },
      segment,
    );
  });
});

const RenderedContent = () => {
  return h(
    "div",
    {
      class: "flex items-center flex-wrap",
    },
    contentNodes.value,
  );
};
</script>

<template>
  <RenderedContent />
</template>
