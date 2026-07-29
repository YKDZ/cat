<script setup lang="ts">
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { onMounted, watch } from "vue";

import WorkbenchShell from "#/pages/editor/WorkbenchShell.vue";
import { useBranchStore } from "#/stores/branch.ts";
import { useEditorContextStore } from "#/stores/editor/context.ts";
import { useQaReviewWorkbenchStore } from "#/stores/qa-review/workbench.ts";

import QaReviewQueueFilter from "../../../../components/QaReviewQueueFilter.vue";
import QaReviewSidebar from "../../../../components/QaReviewSidebar.vue";
import QaReviewWorkbench from "../../../../components/QaReviewWorkbench.vue";
import {
  buildQaReviewHref,
  parseQaReviewElementTarget,
  parseQaReviewElementTargetFromPathname,
  parseQaReviewScopeFromRoute,
} from "../../../../scope-url.ts";

const ctx = usePageContext();
const contextStore = useEditorContextStore();
const branchStore = useBranchStore();
const workbench = useQaReviewWorkbenchStore();
const { scope } = storeToRefs(contextStore);
const { currentBranchId } = storeToRefs(branchStore);

const routeElementTarget = () => {
  const target = parseQaReviewElementTarget(ctx.routeParams.elementId);
  if (target !== "auto") return target;

  // Vike can briefly retain the pre-redirect "auto" route param while the
  // browser URL already points at the resolved element during cold hydration.
  return parseQaReviewElementTargetFromPathname(ctx.urlPathname);
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

onMounted(() => {
  watch(
    () => routeElementTarget(),
    async (value) => {
      if (value === "auto" || value === "empty") return;

      await workbench.syncRouteElement(value);
    },
    { immediate: true },
  );

  watch(
    scope,
    async (nextScope) => {
      if (!nextScope) return;
      await contextStore.refresh();
      await workbench.refreshAll();
    },
    { deep: true, immediate: true },
  );

  watch(currentBranchId, async (value) => {
    if (!scope.value) return;
    if ((scope.value.branchId ?? null) === (value ?? null)) return;

    const next = { ...scope.value, branchId: value ?? undefined };
    contextStore.setScope(next);
    await navigate(
      buildQaReviewHref(next, workbench.selectedElementId ?? "auto"),
    );
  });
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
