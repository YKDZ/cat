<script setup lang="ts">
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { watch } from "vue";

import WorkbenchShell from "@/pages/editor/WorkbenchShell.vue";
import { useBranchStore } from "@/stores/branch";
import { useEditorContextStore } from "@/stores/editor/context";
import { useQaReviewWorkbenchStore } from "@/stores/qa-review/workbench";
import { watchClient } from "@/utils/vue";

import QaReviewQueueFilter from "../../../../components/QaReviewQueueFilter.vue";
import QaReviewSidebar from "../../../../components/QaReviewSidebar.vue";
import QaReviewWorkbench from "../../../../components/QaReviewWorkbench.vue";
import {
  buildQaReviewHref,
  parseQaReviewScopeFromRoute,
} from "../../../../scope-url";

const ctx = usePageContext();
const contextStore = useEditorContextStore();
const branchStore = useBranchStore();
const workbench = useQaReviewWorkbenchStore();
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

    const nextScope = parseQaReviewScopeFromRoute({
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

    await workbench.selectElement(value);
  },
  { immediate: true },
);

watchClient(
  scope,
  async (nextScope) => {
    if (!nextScope) return;
    await contextStore.refresh();
    await workbench.refreshAll();
  },
  { deep: true, immediate: true },
);

watchClient(currentBranchId, async (value) => {
  if (!scope.value) return;
  if ((scope.value.branchId ?? null) === (value ?? null)) return;

  const next = { ...scope.value, branchId: value ?? undefined };
  contextStore.setScope(next);
  await navigate(
    buildQaReviewHref(next, workbench.selectedElementId ?? "auto"),
  );
});
</script>

<template>
  <WorkbenchShell
    left-sidebar-id="editor"
    right-sidebar-id="editor-context-panel"
    :show-editor-status-filter="false"
  >
    <template #header-extra-controls>
      <QaReviewQueueFilter />
    </template>

    <template #sidebar>
      <QaReviewSidebar />
    </template>

    <QaReviewWorkbench />
  </WorkbenchShell>
</template>
