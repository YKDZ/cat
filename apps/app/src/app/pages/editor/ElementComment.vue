<script setup lang="ts">
import ElementCommentReaction from "./ElementCommentReaction.vue";
import Markdown from "@/app/components/Markdown.vue";
import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";
import { Badge } from "@/app/components/ui/badge";
import UserAvatar from "@/app/components/UserAvatar.vue";
import { i18nUseTimeAgoMessages } from "@/app/utils/i18n";
import { orpc } from "@/server/orpc";
import type { TranslatableElementComment } from "@cat/shared/schema/drizzle/document";
import type { User } from "@cat/shared/schema/drizzle/user";
import { useDateFormat, useTimeAgo } from "@vueuse/core";
import { EllipsisVertical, Trash, Smile, Reply } from "lucide-vue-next";
import { ref } from "vue";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import ElementCommentReact from "./ElementCommentReact.vue";
import type { TranslatableElementCommentReactionType } from "@cat/shared/schema/drizzle/enum";
import { Button } from "@/app/components/ui/button";
import { usePageContext } from "vike-vue/usePageContext";
import { useI18n } from "vue-i18n";
import { useQuery } from "@pinia/colada";

const props = withDefaults(
  defineProps<{
    comment: Pick<
      TranslatableElementComment,
      "id" | "userId" | "content" | "createdAt"
    >;
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
  type: TranslatableElementCommentReactionType;
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
    orpc.element.getCommentReactions({
      commentId: props.comment.id,
    }),
  enabled: !import.meta.env.SSR,
});

const { state: childCommentsState } = useQuery({
  key: ["childComments", props.comment.id],
  placeholderData: [],
  query: () =>
    orpc.element.getChildComments({
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
  await orpc.element.deleteComment({
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
      class="relative inline-block w-full outline rounded-xs"
    >
      <div class="flex items-center justify-between">
        <div class="px-2 py-2 relative flex gap-1 w-full text-sm">
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

      <div class="flex px-2 py-1 w-full items-start">
        <Reply
          v-if="reply"
          class="size-4 shrink-0 mr-1 text-muted-foreground"
        />
        <Markdown
          :content="comment.content"
          class="bg-muted flex-1 min-w-0 wrap-break-word"
        />
      </div>

      <div class="bg-muted flex gap-1 p-1">
        <Popover>
          <PopoverTrigger as-child>
            <Badge variant="outline" class="cursor-pointer">
              <Smile />
            </Badge>
          </PopoverTrigger>
          <PopoverContent>
            <div class="flex gap-1 items-center justify-between text-sm">
              <ElementCommentReact
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
        <div class="flex gap-1 h-6">
          <ElementCommentReaction
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
      <ElementComment
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
