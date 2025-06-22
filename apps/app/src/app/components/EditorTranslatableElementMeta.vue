<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useEditorStore } from "../stores/editor";
import Collapse from "./Collapse.vue";

const { element } = storeToRefs(useEditorStore());

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
  <Collapse
    :text="$t('元数据')"
    text-classes="font-bold text-sm"
    class="bottom-3 left-3 absolute"
  >
    <div class="flex flex-col gap-2">
      <div class="text-sm text-nowrap">
        <span
          class="mr-1 px-2 py-1 rounded-sm bg-highlight-darker select-none"
          >{{ $t("Key") }}</span
        >{{ key }}
      </div>
    </div>
  </Collapse>
</template>
