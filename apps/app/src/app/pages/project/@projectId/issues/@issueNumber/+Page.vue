<script setup lang="ts">
import type {
  IssueComment,
  IssueCommentThread,
} from "@cat/shared/schema/drizzle/issue-comment";
import type { CrossReference } from "@cat/shared/schema/drizzle/issue-comment";

import { Badge, Button, Separator } from "@cat/ui";
import { CircleDot, CircleCheck, ChevronLeft } from "@lucide/vue";
import { useQuery } from "@pinia/colada";
import { useData } from "vike-vue/useData";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";

import type { MetadataSection } from "@/app/components/shared/MetadataSidebar.vue";

import MarkdownEditor from "@/app/components/editor/MarkdownEditor.vue";
import InlineEdit from "@/app/components/shared/InlineEdit.vue";
import MetadataSidebar from "@/app/components/shared/MetadataSidebar.vue";
import Timeline from "@/app/components/shared/Timeline.vue";
import { orpc } from "@/app/rpc/orpc";

import type { Data } from "./+data.ts";

const { t } = useI18n();
const { issue: initialIssue, projectId } = useData<Data>();

// ─── Issue State ───

const issueData = ref(initialIssue);

const isOpen = computed(() => issueData.value.status === "OPEN");

// ─── Threads ───

type ThreadWithComments = IssueCommentThread & { comments: IssueComment[] };

const { state: threadsState, refresh: refreshThreads } = useQuery({
  key: () => ["issue-threads", issueData.value.id],
  query: () =>
    orpc.issueComment.listIssueThreads({
      targetType: "issue",
      targetId: issueData.value.id,
    }),
  placeholderData: [] as ThreadWithComments[],
  enabled: !import.meta.env.SSR,
});

const threads = computed(
  () => (threadsState.value.data ?? []) as ThreadWithComments[],
);

// ─── Cross References ───

const { state: refsState } = useQuery({
  key: () => ["issue-refs", issueData.value.id],
  query: () =>
    orpc.issueComment.getCrossReferences({
      targetType: "issue",
      targetId: issueData.value.id,
    }),
  placeholderData: [] as CrossReference[],
  enabled: !import.meta.env.SSR,
});

// ─── Sidebar Sections ───

const sidebarSections = computed<MetadataSection[]>(() => {
  const assignees =
    (issueData.value.assignees as { type: string; id: string }[]) ?? [];
  const refs = refsState.value.data ?? [];

  return [
    {
      title: t("指派人"),
      items: assignees
        .filter((a) => a.type === "user")
        .map((a) => ({ kind: "user" as const, userId: a.id })),
    },
    {
      title: t("交叉引用"),
      items: refs.map((ref) => ({
        kind: "link" as const,
        label: `${ref.sourceType} #${ref.sourceId}`,
        href:
          ref.sourceType === "pr"
            ? `/project/${projectId}/pull-requests/${ref.sourceId}`
            : `/project/${projectId}/issues/${ref.sourceId}`,
      })),
    },
  ];
});

// ─── Actions ───

const handleUpdateTitle = async (newTitle: string) => {
  try {
    issueData.value = await orpc.issue.updateProjectIssue({
      issueId: issueData.value.id,
      title: newTitle,
    });
  } catch {
    toast.error(t("更新标题失败"));
  }
};

const handleUpdateBody = async (newBody: string) => {
  try {
    issueData.value = await orpc.issue.updateProjectIssue({
      issueId: issueData.value.id,
      body: newBody,
    });
  } catch {
    toast.error(t("更新描述失败"));
  }
};

const handleClose = async () => {
  try {
    issueData.value = await orpc.issue.closeProjectIssue({
      issueId: issueData.value.id,
    });
  } catch {
    toast.error(t("关闭 Issue 失败"));
  }
};

const handleReopen = async () => {
  try {
    issueData.value = await orpc.issue.reopenProjectIssue({
      issueId: issueData.value.id,
    });
  } catch {
    toast.error(t("重新打开 Issue 失败"));
  }
};

// ─── Comment ───

const newCommentBody = ref("");

const handlePostComment = async () => {
  if (!newCommentBody.value.trim()) return;
  try {
    const thread = await orpc.issueComment.createIssueCommentThread({
      targetType: "issue",
      targetId: issueData.value.id,
    });
    await orpc.issueComment.addIssueComment({
      threadId: thread.id,
      body: newCommentBody.value,
      targetType: "issue",
      targetId: issueData.value.id,
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

// ─── Inline Title Edit ───

const isEditingTitle = ref(false);
const editTitleValue = ref(issueData.value.title);

const startEditTitle = () => {
  editTitleValue.value = issueData.value.title;
  isEditingTitle.value = true;
};

const saveTitle = async () => {
  await handleUpdateTitle(editTitleValue.value);
  isEditingTitle.value = false;
};

const cancelEditTitle = () => {
  isEditingTitle.value = false;
};
</script>

<template>
  <div class="flex gap-6">
    <!-- Main content area -->
    <div class="min-w-0 flex-1 space-y-4">
      <!-- Back link -->
      <a
        :href="`/project/${projectId}/issues`"
        class="text-sm text-muted-foreground hover:underline"
      >
        <ChevronLeft /> {{ t("议题列表") }}
      </a>

      <!-- Title -->
      <div class="flex items-start gap-2">
        <template v-if="isEditingTitle">
          <input
            v-model="editTitleValue"
            class="flex-1 rounded-md border bg-background px-3 py-1.5 text-xl font-semibold focus:ring-1 focus:ring-ring focus:outline-none"
            @keydown.enter="saveTitle"
            @keydown.escape="cancelEditTitle"
          />
          <Button size="sm" @click="saveTitle">{{ t("保存") }}</Button>
          <Button size="sm" variant="outline" @click="cancelEditTitle">{{
            t("取消")
          }}</Button>
        </template>
        <template v-else>
          <h1 class="text-xl font-semibold">
            {{ issueData.title }}
            <span class="text-muted-foreground">#{{ issueData.number }}</span>
          </h1>
          <Badge :variant="isOpen ? 'default' : 'secondary'" class="shrink-0">
            <CircleDot v-if="isOpen" class="mr-1 size-3" />
            <CircleCheck v-else class="mr-1 size-3" />
            {{ isOpen ? t("Open") : t("Closed") }}
          </Badge>
          <Button
            v-perm="{ object: 'project', id: projectId, relation: 'editor' }"
            variant="ghost"
            size="icon-sm"
            @click="startEditTitle"
          >
            <div class="icon-[mdi--pencil] size-4" />
          </Button>
        </template>
      </div>

      <!-- Status actions -->
      <div class="flex gap-2">
        <Button
          v-if="isOpen"
          v-perm="{ object: 'project', id: projectId, relation: 'editor' }"
          variant="outline"
          size="sm"
          @click="handleClose"
        >
          <CircleCheck class="mr-1 size-3.5" />
          {{ t("关闭 Issue") }}
        </Button>
        <Button
          v-else
          v-perm="{ object: 'project', id: projectId, relation: 'editor' }"
          variant="outline"
          size="sm"
          @click="handleReopen"
        >
          <CircleDot class="mr-1 size-3.5" />
          {{ t("重新打开") }}
        </Button>
      </div>

      <Separator />

      <!-- Issue body -->
      <InlineEdit
        :content="issueData.body"
        :can-edit="true"
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

      <!-- New comment -->
      <div class="space-y-2 rounded-md border p-3">
        <MarkdownEditor v-model="newCommentBody" />
        <div class="flex justify-end">
          <Button :disabled="!newCommentBody.trim()" @click="handlePostComment">
            {{ t("评论") }}
          </Button>
        </div>
      </div>
    </div>

    <!-- Sidebar -->
    <MetadataSidebar :sections="sidebarSections" />
  </div>
</template>
