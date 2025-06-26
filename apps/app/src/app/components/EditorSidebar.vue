<script setup lang="ts">
import { ref } from "vue";
import Sidebar from "./Sidebar.vue";
import Button from "./Button.vue";
import { storeToRefs } from "pinia";
import { useSidebarStore } from "../stores/sidebar";
import { useEditorStore } from "../stores/editor";
import Logo from "./Logo.vue";
import EditorSidebarElement from "./EditorSidebarElement.vue";
import EditorElementSearcher from "./EditorElementSearcher.vue";
import Slash from "./Slash.vue";

const { displayedElements, currentPageIndex, totalPageIndex } =
  storeToRefs(useEditorStore());

const { toPage } = useEditorStore();

const mouseInSidebar = ref<boolean>(false);

const { isFree } = storeToRefs(useSidebarStore());

const handlePreviousPage = () => {
  if (currentPageIndex.value <= 0) return;

  toPage(currentPageIndex.value - 1);
};

const handleNextPage = () => {
  if (currentPageIndex.value >= totalPageIndex.value) return;

  toPage(currentPageIndex.value + 1);
};
</script>

<template>
  <Sidebar v-model:mouse-in-sidebar="mouseInSidebar">
    <div class="flex flex-col gap-3 h-full w-full items-center">
      <!-- Top -->
      <div
        class="px-4.5 pt-3 flex h-fit w-full select-none items-center justify-between"
      >
        <Logo link />
        <!-- Button for free sidebar -->
        <Button
          transparent
          no-text
          :icon="isFree ? 'i-mdi:card-outline' : 'i-mdi:card-off-outline'"
          class="hidden md:flex"
          @click="isFree = !isFree"
        />
      </div>
      <!-- Search Input -->
      <div class="px-3 pb-1 pt-3 w-full">
        <EditorElementSearcher />
      </div>
      <!-- Elements -->
      <div class="px-2 flex flex-col h-full w-full">
        <EditorSidebarElement
          v-for="element in displayedElements"
          :key="element.id"
          :element="element"
        />
        <button
          v-if="displayedElements.length === 0"
          class="px-2 py-2 text-start flex gap-3 items-center"
        >
          <span class="text-nowrap overflow-x-hidden">{{
            $t("没有任何可翻译元素")
          }}</span>
        </button>
      </div>
      <div
        v-if="currentPageIndex !== -1"
        class="px-5 pb-2 flex gap-1 w-full items-center justify-between"
      >
        <Button icon="i-mdi:chevron-left" no-text @click="handlePreviousPage" />
        <span class="inline-flex gap-2 items-center justify-between"
          >{{ currentPageIndex + 1 }} <Slash /> {{ totalPageIndex + 1 }}</span
        >
        <Button icon="i-mdi:chevron-right" no-text @click="handleNextPage" />
      </div>
    </div>
  </Sidebar>
</template>
