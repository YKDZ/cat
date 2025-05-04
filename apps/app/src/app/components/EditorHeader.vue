<script setup lang="ts">
import Header from "./Header.vue";
import Button from "./Button.vue";
import { storeToRefs } from "pinia";
import { useSidebarStore } from "../stores/sidebar";
import { useEditorStore } from "../stores/editor";
import { Project } from "@cat/shared";
import { ref, watch } from "vue";
import { useProjectStore } from "../stores/project";
import DocumentBreadcrumb from "./DocumentBreadcrumb.vue";

const { isFolding } = storeToRefs(useSidebarStore());

const { document } = storeToRefs(useEditorStore());

const project = ref<Project | null>(null);

watch(
  () => document.value?.projectId,
  () => {
    project.value =
      useProjectStore().projects.find(
        (project) => project.id === document.value?.projectId,
      ) ?? null;
  },
  { immediate: true },
);
</script>

<template>
  <Header>
    <Button
      transparent
      no-text
      icon="i-mdi:menu"
      class="font-bold md:hidden"
      @click.stop="isFolding = !isFolding"
    />
    <DocumentBreadcrumb v-if="document" :document />
  </Header>
</template>
