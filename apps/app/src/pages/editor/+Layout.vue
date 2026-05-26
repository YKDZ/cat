<script setup lang="ts">
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { watch } from "vue";

import { useBranchStore } from "@/stores/branch";
import { useEditorContextStore } from "@/stores/editor/context.ts";
import { useEditorElementStore } from "@/stores/editor/element";
import { useEditorTableStore } from "@/stores/editor/table.ts";
import { watchClient } from "@/utils/vue.ts";

import { buildEditorHref, parseEditorScopeFromRoute } from "./scope-url";
import Sidebar from "./Sidebar.vue";
import WorkbenchShell from "./WorkbenchShell.vue";

const ctx = usePageContext();

const contextStore = useEditorContextStore();
const tableStore = useEditorTableStore();
const elementStore = useEditorElementStore();
const branchStore = useBranchStore();

const { scope } = storeToRefs(contextStore);
const { currentBranchId } = storeToRefs(branchStore);

const routeElementTarget = () => {
  const value = ctx.routeParams.elementId;
  if (value === "empty" || value === "auto") return value;

  const parsed = Number.parseInt(String(value ?? "auto"), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : "auto";
};

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

    const routeBranchId = nextScope.branchId ?? null;
    branchStore.restoreProjectBranch({
      projectId: nextScope.projectId,
      branchIdFromRoute: routeBranchId,
    });

    const restoredScope = {
      ...nextScope,
      branchId: branchStore.currentBranchId ?? undefined,
    };
    contextStore.setScope(restoredScope);
  },
  { immediate: true },
);

watchClient(
  () => routeElementTarget(),
  async (value) => {
    if (value === "auto" || value === "empty") return;

    if (tableStore.elementId && value !== tableStore.elementId) {
      tableStore.clear();
    }

    if (tableStore.elementId === value) return;

    await tableStore.toElement(value);
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

  tableStore.stashDraftForCurrentScope();
  const next = { ...scope.value, branchId: value ?? undefined };
  contextStore.setScope(next);
  await navigate(buildEditorHref(next, tableStore.elementId ?? "auto"));
  tableStore.restoreDraftForCurrentScope();
});
</script>

<template>
  <WorkbenchShell>
    <template #sidebar>
      <Sidebar />
    </template>
    <slot />
  </WorkbenchShell>
</template>
