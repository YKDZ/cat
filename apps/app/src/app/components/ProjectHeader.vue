<script setup lang="ts">
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import { inject } from "vue";
import Header from "./Header.vue";
import ProjectBreadcrumb from "./ProjectBreadcrumb.vue";
import HButton from "./headless/HButton.vue";
import { useSidebarStore } from "@/app/stores/sidebar.ts";
import { projectKey } from "@/app/utils/provide.ts";

const { isFolding } = storeToRefs(useSidebarStore());

const ctx = usePageContext();

const project = inject(projectKey);
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
    <ProjectBreadcrumb v-if="project" :project />
    <div v-else class="text-lg font-500 flex items-center">
      {{ ctx.user?.name }}
    </div>
  </Header>
</template>
