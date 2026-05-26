<script setup lang="ts">
import { Separator } from "@cat/ui";
import { useData } from "vike-vue/useData";
import { provide } from "vue";

import IndexSidebar from "@/components/IndexSidebar.vue";
import { useInjectionKey } from "@/utils/provide.ts";

import type { Data } from "./+data.server.ts";
import type {
  ProjectShellData,
  ProjectShellPageData,
} from "./project-shell.server";

import Header from "./Header.vue";
import Navbar from "./Navbar.vue";

type ProjectLayoutData =
  | Data
  | ProjectShellPageData<Record<string, unknown>>
  | ProjectShellData;

const data = useData<ProjectLayoutData>();
const projectShell = "projectShell" in data ? data.projectShell : data;
const { project, targetLanguages, contentNodes } = projectShell;

provide(useInjectionKey<ProjectShellData>()("project"), project);
provide(
  useInjectionKey<ProjectShellData>()("targetLanguages"),
  targetLanguages,
);
provide(useInjectionKey<ProjectShellData>()("contentNodes"), contentNodes);
</script>

<template>
  <div class="flex h-full w-full flex-col md:flex-row">
    <IndexSidebar />
    <div class="flex h-full w-full flex-col overflow-y-auto">
      <Header :project />
      <!-- Content -->
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden px-4">
        <div class="shrink-0 pt-0">
          <Navbar :project />
          <Separator />
        </div>
        <div class="flex min-h-0 flex-1 flex-col overflow-y-auto py-4">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>
