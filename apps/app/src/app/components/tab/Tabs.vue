<script setup lang="ts">
import { computed, useSlots } from "vue";
import type { TabItem } from "./index.ts";

const props = withDefaults(
  defineProps<{
    tabs: TabItem[];
    position?: "top" | "left";
  }>(),
  {
    position: "top",
  },
);

const currentTabId = defineModel<string>();
const slots = useSlots();

const setActiveTab = (tabId: string) => {
  const tab = props.tabs.find((t) => t.id === tabId);
  if (tab && !tab.disabled) {
    currentTabId.value = tabId;
  }
};

const hasCustomTab = computed(() => !!slots.tab);

if (!currentTabId.value && props.tabs.length > 0) {
  currentTabId.value = props.tabs[0].id;
}
</script>

<template>
  <div
    class="flex w-full"
    :class="{
      'flex-col': position === 'top',
      'flex-row': position === 'left',
    }"
  >
    <div
      :class="[
        'flex bg-highlight p-1 gap-2',
        position === 'top' ? 'flex-row' : 'flex-col min-w-[120px]',
      ]"
    >
      <div
        v-for="tab in tabs"
        :key="tab.id"
        :class="[
          'bg-highlight-darker select-none px-4 py-2 text-center rounded relative transition-all bg-highlight hover:bg-highlight-darkest text-highlight-content',
          tab.disabled
            ? 'text-highlight-content cursor-not-allowed'
            : 'cursor-pointer',
        ]"
        @click="setActiveTab(tab.id)"
      >
        <slot
          v-if="hasCustomTab"
          name="tab"
          :tab="tab"
          :is-active="currentTabId === tab.id"
        >
          {{ tab.label }}
        </slot>
        <template v-else>
          {{ tab.label }}
        </template>

        <div
          v-if="currentTabId === tab.id"
          :class="[
            'absolute bg-base',
            position === 'top'
              ? 'h-0.5 bottom-0 left-0 right-0'
              : 'w-0.5 top-0 bottom-0 right-0',
          ]"
        ></div>
      </div>
    </div>

    <div class="p-4 flex-1 overflow-auto">
      <slot :name="currentTabId" />
    </div>
  </div>
</template>
