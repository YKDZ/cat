<script setup lang="ts">
import type {
  IssueComment,
  IssueCommentThread,
} from "@cat/shared/schema/drizzle/issue-comment";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cat/ui";
import { EllipsisVertical, Pencil, Trash } from "@lucide/vue";
import { useTimeAgo } from "@vueuse/core";
import { usePageContext } from "vike-vue/usePageContext";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import UserAvatar from "@/app/components/UserAvatar.vue";
import { i18nUseTimeAgoMessages } from "@/app/utils/i18n";

import InlineEdit from "./InlineEdit.vue";

defineProps<{
  thread: IssueCommentThread;
  comments: IssueComment[];
}>();

const emit = defineEmits<{
  "comment:edit": [commentId: number, newBody: string];
  "comment:delete": [commentId: number];
  "thread:resolve": [threadId: number];
}>();

const { t } = useI18n();
const ctx = usePageContext();

const editingCommentId = ref<number | null>(null);

const isAuthorOrAdmin = (authorId: string | null) => {
  return authorId === ctx.user?.id;
};

const handleSaveEdit = (commentId: number, newBody: string) => {
  emit("comment:edit", commentId, newBody);
  editingCommentId.value = null;
};
</script>

<template>
  <div class="space-y-3">
    <div
      v-for="comment in comments"
      :key="comment.id"
      class="rounded-md border"
    >
      <!-- Comment header -->
      <div
        class="flex items-center justify-between border-b bg-muted/30 px-3 py-2"
      >
        <div class="flex items-center gap-2 text-sm">
          <UserAvatar :user-id="comment.authorId" :size="24" with-name />
          <span class="text-muted-foreground">
            {{
              useTimeAgo(comment.createdAt, {
                messages: i18nUseTimeAgoMessages,
              }).value
            }}
          </span>
          <span
            v-if="comment.editedAt"
            class="text-xs text-muted-foreground italic"
          >
            ({{ t("已编辑") }})
          </span>
        </div>

        <DropdownMenu v-if="isAuthorOrAdmin(comment.authorId)">
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon-sm">
              <EllipsisVertical class="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="editingCommentId = comment.id">
              <Pencil class="mr-2 size-4" />
              {{ t("编辑") }}
            </DropdownMenuItem>
            <DropdownMenuItem
              class="text-destructive"
              @click="emit('comment:delete', comment.id)"
            >
              <Trash class="mr-2 size-4" />
              {{ t("删除") }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <!-- Comment body -->
      <div class="p-3">
        <InlineEdit
          :content="comment.body"
          :can-edit="isAuthorOrAdmin(comment.authorId)"
          :editing="editingCommentId === comment.id"
          @save="(newBody) => handleSaveEdit(comment.id, newBody)"
          @cancel="editingCommentId = null"
        />
      </div>
    </div>
  </div>
</template>
