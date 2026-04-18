<script setup lang="ts">
import type {
  IssueComment,
  IssueCommentThread,
} from "@cat/shared/schema/drizzle/issue-comment";
import type { CrossReference } from "@cat/shared/schema/drizzle/issue-comment";

import {
  Badge,
  Button,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@cat/ui";
import {
  Bot,
  CircleDot,
  CircleCheck,
  GitMerge,
  ChevronLeft,
} from "@lucide/vue";
import { useQuery } from "@pinia/colada";
import { useData } from "vike-vue/useData";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";

import type { MetadataSection } from "@/app/components/shared/MetadataSidebar.vue";

import ChangeSetEntityGroup from "@/app/components/changeset/ChangeSetEntityGroup.vue";
import MarkdownEditor from "@/app/components/editor/MarkdownEditor.vue";
import InlineEdit from "@/app/components/shared/InlineEdit.vue";
import MetadataSidebar from "@/app/components/shared/MetadataSidebar.vue";
import Timeline from "@/app/components/shared/Timeline.vue";
import { orpc } from "@/app/rpc/orpc";
import { useBranchStore } from "@/app/stores/branch";

import type { Data } from "./+data.ts";

const { t } = useI18n();
const data = useData<Data>();
const { projectId } = data;

// ─── PR State ───

const prData = ref(data.pr);
const branchStore = useBranchStore();

watch(
  () => data.pr,
  (currentPr) => {
    prData.value = currentPr;
    if (
      currentPr &&
      !["MERGED", "CLOSED"].includes(currentPr.status) &&
      currentPr.branchId !== null
    ) {
      branchStore.enterBranch(
        currentPr.branchId,
        currentPr.id,
        currentPr.number,
        `pr-${currentPr.number}`,
      );
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  branchStore.leaveBranch();
});

const activeTab = ref("conversation");

// ─── Status helpers ───

const statusBadge = computed(() => {
  const map: Record<
    string,
    {
      label: string;
      variant: "default" | "secondary" | "destructive" | "outline";
    }
  > = {
    DRAFT: { label: t("Draft"), variant: "secondary" },
    OPEN: { label: t("Open"), variant: "default" },
    REVIEW: { label: t("Review"), variant: "outline" },
    CHANGES_REQUESTED: {
      label: t("Changes Requested"),
      variant: "destructive",
    },
    MERGED: { label: t("Merged"), variant: "secondary" },
    CLOSED: { label: t("Closed"), variant: "secondary" },
  };
  return (
    map[prData.value.status] ?? {
      label: prData.value.status,
      variant: "outline" as const,
    }
  );
});

const isTerminal = computed(() =>
  ["MERGED", "CLOSED"].includes(prData.value.status),
);

// ─── Threads ───

type ThreadWithComments = IssueCommentThread & { comments: IssueComment[] };

const { state: threadsState, refresh: refreshThreads } = useQuery({
  key: () => ["pr-threads", prData.value.id],
  query: () =>
    orpc.issueComment.listIssueThreads({
      targetType: "pr",
      targetId: prData.value.id,
    }),
  placeholderData: [] as ThreadWithComments[],
  enabled: !import.meta.env.SSR,
});

const threads = computed(
  () => (threadsState.value.data ?? []) as ThreadWithComments[],
);

// ─── Cross References ───

const { state: refsState } = useQuery({
  key: () => ["pr-refs", prData.value.id],
  query: () =>
    orpc.issueComment.getCrossReferences({
      targetType: "pr",
      targetId: prData.value.id,
    }),
  placeholderData: [] as CrossReference[],
  enabled: !import.meta.env.SSR,
});

// ─── Diff ───

const { state: diffState } = useQuery({
  key: () => ["pr-diff", prData.value.id],
  query: () =>
    orpc.pullRequest.getProjectPRDiff({
      prId: prData.value.id,
    }),
  placeholderData: [],
  enabled: !import.meta.env.SSR,
});

const diffEntries = computed(
  () =>
    (diffState.value.data ?? []) as Array<{
      id: number;
      entityType: string;
      entityId: string;
      action: string;
      before: unknown;
      after: unknown;
      fieldPath: string | null;
      riskLevel: string;
      reviewStatus: string;
      asyncStatus: string | null;
    }>,
);

const groupedDiff = computed(() => {
  const groups: Record<string, typeof diffEntries.value> = {};
  for (const entry of diffEntries.value) {
    if (!groups[entry.entityType]) groups[entry.entityType] = [];
    groups[entry.entityType]!.push(entry);
  }
  return groups;
});

// ─── Sidebar Sections ───

const sidebarSections = computed<MetadataSection[]>(() => {
  const reviewers =
    (prData.value.reviewers as { type: string; id: string }[]) ?? [];
  const refs = refsState.value.data ?? [];

  return [
    {
      title: t("审阅者"),
      items: reviewers
        .filter((r) => r.type === "user")
        .map((r) => ({ kind: "user" as const, userId: r.id })),
    },
    {
      title: t("关联议题"),
      items: refs
        .filter((ref) => ref.sourceType === "issue")
        .map((ref) => ({
          kind: "link" as const,
          label: `Issue #${ref.sourceId}`,
          href: `/project/${projectId}/issues/${ref.sourceId}`,
        })),
    },
  ];
});

// ─── Actions ───

const handleUpdateBody = async (newBody: string) => {
  try {
    prData.value = await orpc.pullRequest.updateProjectPR({
      prId: prData.value.id,
      body: newBody,
    });
  } catch {
    toast.error(t("更新描述失败"));
  }
};

const handleClose = async () => {
  try {
    prData.value = await orpc.pullRequest.closeProjectPR({
      prId: prData.value.id,
    });
    branchStore.leaveBranch();
  } catch {
    toast.error(t("关闭 PR 失败"));
  }
};

const handleReopen = async () => {
  try {
    prData.value = await orpc.pullRequest.updateProjectPRStatus({
      prId: prData.value.id,
      status: "OPEN",
    });
  } catch {
    toast.error(t("重新打开 PR 失败"));
  }
};

// ─── Merge ───

const merging = ref(false);

const handleMerge = async () => {
  merging.value = true;
  try {
    const result = await orpc.pullRequest.mergeProjectPR({
      prExternalId: prData.value.externalId,
      mergedBy: "current-user",
    });
    if (result.hasConflicts) {
      toast.error(t("合并存在冲突，请先 Rebase"));
    } else {
      toast.success(t("PR 已成功合并"));
      branchStore.leaveBranch();
      // Reload PR data to reflect merged status
      prData.value = { ...prData.value, status: "MERGED" };
    }
  } catch {
    toast.error(t("合并失败"));
  } finally {
    merging.value = false;
  }
};

const handleRebase = async () => {
  try {
    const result = await orpc.pullRequest.rebaseProjectPR({
      prExternalId: prData.value.externalId,
    });
    if (result.hasConflicts) {
      toast.error(t("Rebase 存在冲突"));
    } else {
      toast.success(t("Rebase 成功"));
    }
  } catch {
    toast.error(t("Rebase 失败"));
  }
};

// ─── Comment ───

const newCommentBody = ref("");

const handlePostComment = async () => {
  if (!newCommentBody.value.trim()) return;
  try {
    const thread = await orpc.issueComment.createIssueCommentThread({
      targetType: "pr",
      targetId: prData.value.id,
    });
    await orpc.issueComment.addIssueComment({
      threadId: thread.id,
      body: newCommentBody.value,
      targetType: "pr",
      targetId: prData.value.id,
    });
    newCommentBody.value = "";
    refreshThreads();
  } catch {
    toast.error(t("发布评论失败"));
  }
};

const handleEditComment = async (commentId: number, newBody: string) => {
  try {
    await orpc.issueComment.editIssueComment({ commentId, body: newBody });
    refreshThreads();
  } catch {
    toast.error(t("编辑评论失败"));
  }
};

const handleDeleteComment = async (commentId: number) => {
  try {
    await orpc.issueComment.removeIssueComment({ commentId });
    refreshThreads();
  } catch {
    toast.error(t("删除评论失败"));
  }
};
</script>

<template>
  <div class="flex gap-6">
    <!-- Main content area -->
    <div class="min-w-0 flex-1 space-y-4">
      <!-- Back link -->
      <a
        :href="`/project/${projectId}/pull-requests`"
        class="text-sm text-muted-foreground hover:underline"
      >
        <ChevronLeft /> {{ t("拉取请求") }}
      </a>

      <!-- Title -->
      <div class="flex items-start gap-2">
        <h1 class="text-xl font-semibold">
          {{ prData.title }}
          <span class="text-muted-foreground">#{{ prData.number }}</span>
        </h1>
        <Badge :variant="statusBadge.variant">
          {{ statusBadge.label }}
        </Badge>
        <Badge v-if="prData.type === 'AUTO_TRANSLATE'" variant="secondary">
          <Bot class="mr-0.5 size-3" />
        </Badge>
      </div>

      <!-- Status actions -->
      <div v-if="!isTerminal" class="flex gap-2">
        <Button
          v-perm="{ object: 'project', id: projectId, relation: 'editor' }"
          variant="outline"
          size="sm"
          @click="handleClose"
        >
          <CircleCheck class="mr-1 size-3.5" />
          {{ t("关闭") }}
        </Button>
      </div>

      <div v-if="prData.status === 'CLOSED'" class="flex gap-2">
        <Button
          v-perm="{ object: 'project', id: projectId, relation: 'editor' }"
          variant="outline"
          size="sm"
          @click="handleReopen"
        >
          <CircleDot class="mr-1 size-3.5 text-green-600" />
          {{ t("重新打开") }}
        </Button>
      </div>

      <Separator />

      <!-- Tabs -->
      <Tabs v-model="activeTab">
        <TabsList>
          <TabsTrigger value="conversation">{{ t("讨论") }}</TabsTrigger>
          <TabsTrigger value="files">{{ t("变更") }}</TabsTrigger>
        </TabsList>

        <!-- Conversation Tab -->
        <TabsContent value="conversation" class="space-y-4">
          <!-- PR body -->
          <InlineEdit
            :content="prData.body"
            :can-edit="!isTerminal"
            @save="handleUpdateBody"
          />

          <Separator />

          <!-- Timeline -->
          <div
            v-if="threadsState.status === 'pending'"
            class="py-4 text-center text-sm text-muted-foreground"
          >
            {{ t("加载评论中...") }}
          </div>
          <Timeline
            v-else
            :threads="threads"
            @comment:edit="handleEditComment"
            @comment:delete="handleDeleteComment"
          />

          <!-- Merge panel -->
          <div
            v-if="!isTerminal"
            v-perm="{ object: 'project', id: projectId, relation: 'editor' }"
            class="space-y-3 rounded-md border p-4"
          >
            <div class="flex items-center gap-3">
              <Button :disabled="merging" @click="handleMerge">
                <GitMerge class="mr-1 size-4" />
                {{ t("合并拉取请求") }}
              </Button>
              <Button variant="outline" @click="handleRebase">
                {{ t("变基") }}
              </Button>
            </div>
          </div>

          <!-- Merged/Closed banner -->
          <div
            v-if="prData.status === 'MERGED'"
            class="rounded-md border border-purple-200 bg-purple-50 p-3 text-sm text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300"
          >
            <GitMerge class="mr-1 inline size-4" />
            {{ t("此拉取请求已成功合并") }}
          </div>
          <div
            v-else-if="prData.status === 'CLOSED'"
            class="rounded-md border bg-muted p-3 text-sm text-muted-foreground"
          >
            <CircleCheck class="mr-1 inline size-4" />
            {{ t("此拉取请求已关闭") }}
          </div>

          <!-- New comment -->
          <div v-if="!isTerminal" class="space-y-2 rounded-md border p-3">
            <MarkdownEditor v-model="newCommentBody" />
            <div class="flex justify-end">
              <Button
                :disabled="!newCommentBody.trim()"
                @click="handlePostComment"
              >
                {{ t("评论") }}
              </Button>
            </div>
          </div>
        </TabsContent>

        <!-- Files Changed Tab -->
        <TabsContent value="files" class="space-y-3">
          <div
            v-if="diffState.status === 'pending'"
            class="py-8 text-center text-sm text-muted-foreground"
          >
            {{ t("加载变更中...") }}
          </div>
          <div
            v-else-if="diffEntries.length === 0"
            class="py-8 text-center text-sm text-muted-foreground"
          >
            {{ t("暂无变更") }}
          </div>
          <template v-else>
            <ChangeSetEntityGroup
              v-for="(entries, entityType) in groupedDiff"
              :key="entityType"
              :entity-type="String(entityType)"
              :entries="entries"
            />
          </template>
        </TabsContent>
      </Tabs>
    </div>

    <!-- Sidebar -->
    <MetadataSidebar :sections="sidebarSections" />
  </div>
</template>
