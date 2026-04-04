<script setup lang="ts">
import type { Comment } from "@cat/shared/schema/drizzle/comment";
import type { User } from "@cat/shared/schema/drizzle/user";
import type { CommentReactionType } from "@cat/shared/schema/enum";

import { Badge } from "@cat/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@cat/ui";
import { Button } from "@cat/ui";
import { EllipsisVertical, Trash, Smile, Reply } from "@lucide/vue";
import { useQuery } from "@pinia/colada";
import { useDateFormat, useTimeAgo } from "@vueuse/core";
import { usePageContext } from "vike-vue/usePageContext";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import Markdown from "@/app/components/Markdown.vue";
import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";
import UserAvatar from "@/app/components/UserAvatar.vue";
import { orpc } from "@/app/rpc/orpc";
import { i18nUseTimeAgoMessages } from "@/app/utils/i18n";

import CommentReact from "./CommentReact.vue";
import CommentReaction from "./CommentReaction.vue";

const props = withDefaults(
  defineProps<{
    comment: Pick<Comment, "id" | "userId" | "content" | "createdAt">;
    reply?: boolean;
  }>(),
  {
    reply: false,
  },
);

const emits = defineEmits<{
  delete: [commentId: number];
}>();

const { t } = useI18n();
const ctx = usePageContext();

const emojis: {
  emoji: string;
  type: CommentReactionType;
}[] = [
  {
    emoji: "👍",
    type: "+1",
  },
  {
    emoji: "👎",
    type: "-1",
  },
  {
    emoji: "😄",
    type: "LAUGH",
  },
  {
    emoji: "🎉",
    type: "HOORAY",
  },
  {
    emoji: "😕",
    type: "CONFUSED",
  },
  {
    emoji: "❤️",
    type: "HEART",
  },
  {
    emoji: "🚀",
    type: "ROCKET",
  },
  {
    emoji: "👀",
    type: "EYES",
  },
];

const user = ref<User | null>(null);

const timeAgo = useTimeAgo(props.comment.createdAt, {
  messages: i18nUseTimeAgoMessages,
});
const createdAt = useDateFormat(props.comment.createdAt, "YYYY-MM-DD HH:mm:ss");

const { state: reactionsState, refetch: refetchReactions } = useQuery({
  key: ["reactions", props.comment.id],
  placeholderData: [],
  query: () =>
    orpc.comment.getCommentReactions({
      commentId: props.comment.id,
    }),
  enabled: !import.meta.env.SSR,
});

const { state: childCommentsState } = useQuery({
  key: ["childComments", props.comment.id],
  placeholderData: [],
  query: () =>
    orpc.comment.getChildComments({
      rootCommentId: props.comment.id,
    }),
  enabled: !import.meta.env.SSR,
});

const handleReact = () => {
  refetchReactions();
};

const handleUnReact = () => {
  refetchReactions();
};

const handleDelete = async () => {
  await orpc.comment.deleteComment({
    commentId: props.comment.id,
  });
  emits("delete", props.comment.id);
};
</script>

<template>
  <div class="flex flex-col gap-0">
    <div
      :class="{
        'bg-accent text-accent-foreground': !reply,
        'bg-muted text-muted-foreground': reply,
      }"
      class="relative inline-block w-full rounded-xs outline"
    >
      <div class="flex items-center justify-between">
        <div class="relative flex w-full gap-1 px-2 py-2 text-sm">
          <UserAvatar
            v-model="user"
            :user-id="comment.userId"
            :size="reply ? 24 : 28"
            with-name
          />

          <TextTooltip :tooltip="createdAt">
            <span class="hover:underline">{{ timeAgo }}</span>
          </TextTooltip>
        </div>
        <Popover>
          <PopoverTrigger as-child>
            <Button variant="ghost" size="icon-sm">
              <EllipsisVertical />
            </Button>
          </PopoverTrigger>
          <PopoverContent class="w-fit p-1">
            <Button
              v-if="comment.userId === ctx.user?.id"
              variant="ghost"
              size="sm"
              @click="handleDelete"
              ><Trash class="text-destructive" />{{ t("删除") }}</Button
            >
          </PopoverContent>
        </Popover>
      </div>

      <div class="flex w-full items-start px-2 py-1">
        <Reply
          v-if="reply"
          class="mr-1 size-4 shrink-0 text-muted-foreground"
        />
        <Markdown
          :content="comment.content"
          class="min-w-0 flex-1 bg-muted wrap-break-word"
        />
      </div>

      <div class="flex gap-1 bg-muted p-1">
        <Popover>
          <PopoverTrigger as-child>
            <Badge variant="outline" class="cursor-pointer">
              <Smile />
            </Badge>
          </PopoverTrigger>
          <PopoverContent>
            <div class="flex items-center justify-between gap-1 text-sm">
              <CommentReact
                v-for="emoji in emojis"
                :key="emoji.type"
                :comment="comment"
                :type="emoji.type"
                :emoji="emoji.emoji"
                :reactions="reactionsState.data ?? []"
                @react="handleReact"
                @un-react="handleUnReact"
              />
            </div>
          </PopoverContent>
        </Popover>
        <div class="flex h-6 gap-1">
          <CommentReaction
            v-for="emoji in emojis"
            :key="emoji.type"
            :emoji="emoji.emoji"
            :type="emoji.type"
            :reactions="reactionsState.data ?? []"
            :comment
            @react="handleReact"
            @un-react="handleUnReact"
          />
        </div>
      </div>
    </div>
    <div>
      <Comment
        v-for="childComment in childCommentsState.data ?? []"
        :key="childComment.id"
        :comment="childComment"
        :reply="true"
        @react="handleReact"
        @un-react="handleUnReact"
        @delete="handleDelete"
      />
    </div>
  </div>
</template>
