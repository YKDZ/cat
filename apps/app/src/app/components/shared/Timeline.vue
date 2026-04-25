<script setup lang="ts">
import type { IssueComment, IssueCommentThread } from "@cat/shared";

import { useI18n } from "vue-i18n";

import CommentThread from "./CommentThread.vue";

type ThreadWithComments = IssueCommentThread & {
  comments: IssueComment[];
};

defineProps<{
  threads: ThreadWithComments[];
}>();

const emit = defineEmits<{
  "comment:edit": [commentId: number, newBody: string];
  "comment:delete": [commentId: number];
  "thread:resolve": [threadId: number];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="threads.length === 0"
      class="py-4 text-center text-sm text-muted-foreground"
    >
      {{ t("暂无评论。") }}
    </div>
    <CommentThread
      v-for="thread in threads"
      :key="thread.id"
      :thread="thread"
      :comments="thread.comments"
      @comment:edit="(id, body) => emit('comment:edit', id, body)"
      @comment:delete="(id) => emit('comment:delete', id)"
      @thread:resolve="(id) => emit('thread:resolve', id)"
    />
  </div>
</template>
