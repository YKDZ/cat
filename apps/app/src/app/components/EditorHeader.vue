<script setup lang="ts">
import Header from "./Header.vue";
import { storeToRefs } from "pinia";
import { useSidebarStore } from "@/app/stores/sidebar";
import { useEditorStore } from "@/app/stores/editor";
import type { Project } from "@cat/shared/schema/prisma/project";
import { ref, watch } from "vue";
import { useProjectStore } from "@/app/stores/project";
import DocumentBreadcrumb from "./DocumentBreadcrumb.vue";
import HButton from "./headless/HButton.vue";

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
    <HButton
      :classes="{
        base: 'btn btn-md btn-transparent btn-square',
      }"
      icon="i-mdi:menu"
      class="font-bold md:hidden"
      @click.stop="isFolding = !isFolding"
    />
    <DocumentBreadcrumb v-if="document" :document />
  </Header>
</template>
