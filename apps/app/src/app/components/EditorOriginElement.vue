<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import Collapse from "./Collapse.vue";
import { ref, computed } from "vue";
import TranslatableElementValue from "./TranslatableElementValue.vue";

const { element, originDivEl } = storeToRefs(useEditorStore());

const isSticky = ref(true);

const key = computed(() =>
  (
    element.value?.meta as {
      key: string[];
    }
  ).key
    .map((key) => {
      if (key.includes(".")) {
        return `"${key}"`;
      }
      return key;
    })
    .join("."),
);
</script>

<template>
  <div
    ref="originDivEl"
    :class="{
      sticky: isSticky,
    }"
    class="px-5 pt-4 border-b-1 bg-highlight bg-op-50 flex flex-col h-fit min-h-34 w-full top-0 relative z-10 backdrop-blur-sm -mb-2"
  >
    <TranslatableElementValue />
    <Collapse
      text="元数据"
      text-classes="font-bold text-sm"
      class="bottom-3 left-3 absolute"
    >
      <div class="flex flex-col gap-2">
        <div class="text-sm text-nowrap">
          <span
            class="mr-1 px-2 py-1 rounded-sm bg-highlight-darker select-none"
            >Key</span
          >{{ key }}
        </div>
      </div>
    </Collapse>
  </div>
</template>
