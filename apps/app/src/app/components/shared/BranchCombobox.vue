<script setup lang="ts">
import type { PullRequest } from "@cat/shared/schema/drizzle/pull-request";

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
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/app/rpc/orpc";
import { useBranchStore } from "@/app/stores/branch";

const props = defineProps<{
  projectId: string;
}>();

const { t } = useI18n();
const branchStore = useBranchStore();

const searchTerm = ref("");

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

const displayName = computed(() => {
  if (branchStore.isOnMainBranch) return "main";
  return branchStore.currentBranchName ?? `PR #${branchStore.currentPRNumber}`;
});

const handleSelect = (pr: PullRequest) => {
  branchStore.enterBranch(pr.branchId, pr.id, pr.number, `pr-${pr.number}`);
};

const handleSelectMain = () => {
  branchStore.leaveBranch();
};
</script>

<template>
  <Combobox v-model:search-term="searchTerm">
    <ComboboxAnchor>
      <ComboboxTrigger as-child>
        <Button variant="outline" size="sm">
          <GitBranch class="size-3.5 text-muted-foreground" />
          <span class="max-w-32 truncate">{{ displayName }}</span></Button
        >
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
