<script setup lang="ts">
import type { PullRequest } from "@cat/shared";

import {
  Combobox,
  ComboboxAnchor,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  Button,
} from "@cat/ui";
import { GitBranch } from "@lucide/vue";
import { useQuery } from "@pinia/colada";
import { navigate } from "vike/client/router";
import { usePageContext } from "vike-vue/usePageContext";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { buildEditorHref, parseEditorScopeFromRoute } from "@/pages/editor/scope-url";
import {
  buildQaReviewHref,
  parseQaReviewScopeFromRoute,
} from "@/pages/qa-review/scope-url";
import { orpc } from "@/rpc/orpc";
import { useBranchStore } from "@/stores/branch";

const props = defineProps<{
  projectId: string;
}>();

const { t } = useI18n();
const ctx = usePageContext();
const branchStore = useBranchStore();

const searchTerm = ref("");

const resolveWorkbenchTarget = () => {
  const value = ctx.routeParams.elementId;
  if (value === "auto" || value === "empty") return value;

  const parsed = Number.parseInt(String(value ?? "auto"), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const syncBranchToWorkbenchRoute = async (branchId: number | undefined) => {
  if (import.meta.env.SSR) return;
  if (ctx.routeParams.projectId !== props.projectId) return;

  const languageToId = ctx.routeParams.languageToId;
  const target = resolveWorkbenchTarget();
  if (typeof languageToId !== "string" || target === null) return;

  const searchParams = new URLSearchParams(ctx.urlParsed.searchOriginal ?? "");

  if (ctx.urlPathname.startsWith("/editor/project/")) {
    const scope = parseEditorScopeFromRoute({
      projectId: props.projectId,
      languageToId,
      searchParams,
    });

    if ((scope.branchId ?? undefined) === branchId) return;

    await navigate(buildEditorHref({ ...scope, branchId }, target));
    return;
  }

  if (ctx.urlPathname.startsWith("/qa-review/project/")) {
    const scope = parseQaReviewScopeFromRoute({
      projectId: props.projectId,
      languageToId,
      searchParams,
    });

    if ((scope.branchId ?? undefined) === branchId) return;

    await navigate(buildQaReviewHref({ ...scope, branchId }, target));
  }
};

// Fetch OPEN + DRAFT PRs for the branch list
const { state: prsState } = useQuery({
  key: () => ["branch-prs", props.projectId],
  query: async () => {
    const [openPrs, draftPrs] = await Promise.all([
      orpc.pullRequest.listProjectPRs({
        projectId: props.projectId,
        status: "OPEN",
      }),
      orpc.pullRequest.listProjectPRs({
        projectId: props.projectId,
        status: "DRAFT",
      }),
    ]);
    return [...openPrs, ...draftPrs];
  },
  placeholderData: [] as PullRequest[],
  enabled: !import.meta.env.SSR,
  staleTime: 30_000,
});

const prs = computed(() => prsState.value.data ?? []);

const filteredPrs = computed(() => {
  if (!searchTerm.value) return prs.value;
  const q = searchTerm.value.toLowerCase();
  return prs.value.filter(
    (pr) => pr.title.toLowerCase().includes(q) || `pr-${pr.number}`.includes(q),
  );
});

watch(
  () => props.projectId,
  (projectId) => {
    if (branchStore.currentProjectId === projectId) return;
    branchStore.restoreProjectBranch({ projectId, branchIdFromRoute: null });
  },
  { immediate: true },
);

const hasLoadedPrs = computed(() => prsState.value.status === "success");

watch(
  [
    () => branchStore.currentProjectId,
    () => branchStore.currentBranchId,
    prs,
    hasLoadedPrs,
  ],
  ([projectId, branchId, availablePrs, loaded]) => {
    if (projectId !== props.projectId || branchId === null) return;

    const matchedPr = availablePrs.find((pr) => pr.branchId === branchId);
    if (matchedPr) {
      branchStore.enterBranch({
        projectId: props.projectId,
        branchId: matchedPr.branchId,
        prId: matchedPr.id,
        prNumber: matchedPr.number,
        branchName: `pr-${matchedPr.number}`,
      });
      return;
    }

    if (loaded) {
      branchStore.markStale(props.projectId);
    }
  },
  { immediate: true },
);

watch(
  [() => branchStore.currentProjectId, () => branchStore.currentBranchId],
  ([projectId, branchId]) => {
    if (projectId !== props.projectId) return;
    void syncBranchToWorkbenchRoute(branchId ?? undefined);
  },
);

const displayName = computed(() => {
  if (branchStore.currentProjectId !== props.projectId) return t("main");
  if (branchStore.isOnMainBranch) return t("main");
  return (
    branchStore.currentBranchName ??
    (branchStore.currentBranchId !== null
      ? `branch-${branchStore.currentBranchId}`
      : t("main"))
  );
});

const handleSelect = (pr: PullRequest) => {
  branchStore.enterBranch({
    projectId: props.projectId,
    branchId: pr.branchId,
    prId: pr.id,
    prNumber: pr.number,
    branchName: `pr-${pr.number}`,
  });
};

const handleSelectMain = () => {
  branchStore.leaveBranch(props.projectId);
};
</script>

<template>
  <Combobox v-model:search-term="searchTerm">
    <ComboboxAnchor>
      <ComboboxTrigger as-child>
        <Button variant="outline" size="sm">
          <GitBranch class="size-3.5 text-muted-foreground" />
          <span class="max-w-32 truncate">{{ displayName }}</span>
          <span
            v-if="
              branchStore.currentProjectId === props.projectId &&
              branchStore.validationStatus === 'pending'
            "
            class="text-xs text-muted-foreground"
          >
            {{ t("加载中") }}
          </span>
        </Button>
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxList class="w-64">
      <ComboboxInput :placeholder="t('搜索分支...')" />
      <ComboboxEmpty>{{ t("未找到分支") }}</ComboboxEmpty>
      <ComboboxItem value="main" @select="handleSelectMain">
        <GitBranch class="mr-2 size-3.5" />
        {{ t("main") }}
      </ComboboxItem>
      <ComboboxItem
        v-for="pr in filteredPrs"
        :key="pr.id"
        :value="`pr-${pr.number}`"
        @select="handleSelect(pr)"
      >
        <GitBranch class="mr-2 size-3.5" />
        <span class="truncate">pr-{{ pr.number }} — {{ pr.title }}</span>
      </ComboboxItem>
    </ComboboxList>
  </Combobox>
</template>
