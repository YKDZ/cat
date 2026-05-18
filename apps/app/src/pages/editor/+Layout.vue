<script setup lang="ts">
import { ScrollArea } from "@cat/ui";
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { watch } from "vue";

import { useBranchStore } from "@/stores/branch";
import { useEditorContextStore } from "@/stores/editor/context.ts";
import { useEditorElementStore } from "@/stores/editor/element";
import { useEditorTableStore } from "@/stores/editor/table.ts";
import { watchClient } from "@/utils/vue.ts";

import ContextPanel from "./ContextPanel.vue";
import Header from "./Header.vue";
import { buildEditorHref, parseEditorScopeFromRoute } from "./scope-url";
import Sidebar from "./Sidebar.vue";

const ctx = usePageContext();

const contextStore = useEditorContextStore();
const tableStore = useEditorTableStore();
const elementStore = useEditorElementStore();
const branchStore = useBranchStore();

const { scope } = storeToRefs(contextStore);
const { currentBranchId } = storeToRefs(branchStore);

watch(
  () => [
    ctx.routeParams.projectId,
    ctx.routeParams.languageToId,
    ctx.urlParsed.searchOriginal ?? "",
  ],
  () => {
    if (!ctx.routeParams.projectId || !ctx.routeParams.languageToId) return;

    const nextScope = parseEditorScopeFromRoute({
      projectId: ctx.routeParams.projectId,
      languageToId: ctx.routeParams.languageToId,
      searchParams: new URLSearchParams(ctx.urlParsed.searchOriginal ?? ""),
    });

    contextStore.setScope(nextScope);
    branchStore.setBranchIdFromRoute(nextScope.branchId ?? null);
  },
  { immediate: true },
);

watchClient(
  () => ctx.routeParams.elementId,
  async (value) => {
    if (value === "auto" || value === "empty") return;

    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isInteger(parsed)) return;

    if (tableStore.elementId && parsed !== tableStore.elementId) {
      tableStore.clear();
    }

    if (tableStore.elementId === parsed) return;

    await tableStore.toElement(parsed);
  },
  { immediate: true },
);

watchClient(
  scope,
  async (nextScope) => {
    if (!nextScope) return;
    await contextStore.refresh();
    await elementStore.clearAndLoadCurrentPage();
  },
  { deep: true, immediate: true },
);

watchClient(currentBranchId, async (value) => {
  if (!scope.value) return;
  if ((scope.value.branchId ?? null) === (value ?? null)) return;

  const next = { ...scope.value, branchId: value ?? undefined };
  contextStore.setScope(next);
  await navigate(buildEditorHref(next, tableStore.elementId ?? "auto"));
});
</script>

<template>
  <div
    class="flex h-full max-h-full w-full flex-col overflow-hidden md:flex-row"
  >
    <div class="h-full shrink-0">
      <Sidebar />
    </div>

    <div class="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <div class="sticky top-0 z-10 border-b bg-background">
        <Header />
      </div>

      <div class="min-h-0 w-full flex-1">
        <ScrollArea class="h-full w-full">
          <slot />
        </ScrollArea>
      </div>
    </div>

    <div
      class="flex h-full w-full shrink-0 flex-col overflow-hidden border-t md:w-auto md:border-t-0 md:border-l"
    >
      <ContextPanel />
    </div>
  </div>
</template>
