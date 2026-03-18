<script setup lang="ts">
import { SidebarProvider } from "@cat/ui";
import { Toaster } from "@cat/ui";
import { PiniaColadaDevtools } from "@pinia/colada-devtools";
import { usePageContext } from "vike-vue/usePageContext";

import { useCookieBooleanRef } from "@/app/utils/cookie";

const ctx = usePageContext();


const indexSidebarOpen = useCookieBooleanRef(
  usePageContext(),
  "indexSidebarOpen",
  true,
);
const editorSidebarOpen = useCookieBooleanRef(ctx, "editorSidebarOpen", true);
const editorContextPanelOpen = useCookieBooleanRef(
  ctx,
  "editorContextPanelOpen",
  true,
);
const adminSidebarOpen = useCookieBooleanRef(ctx, "adminSidebarOpen", true);
</script>

<template>
  <SidebarProvider id="index" v-model="indexSidebarOpen">
    <SidebarProvider
      id="editor-context-panel"
      v-model="editorContextPanelOpen"
      :width="320"
      side="right"
    >
      <SidebarProvider id="editor" v-model="editorSidebarOpen">
        <SidebarProvider id="admin" v-model="adminSidebarOpen">
          <div
            class="h-screen max-h-screen min-h-screen w-screen max-w-screen min-w-screen overflow-x-hidden overflow-y-auto bg-background"
          >
            <slot /></div></SidebarProvider></SidebarProvider></SidebarProvider
  ></SidebarProvider>
  <Toaster class="pointer-events-auto" />

  <PiniaColadaDevtools />
</template>
