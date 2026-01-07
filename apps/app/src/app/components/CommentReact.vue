<script setup lang="ts">
import { Button } from "@/app/components/ui/button";
import { orpc } from "@/server/orpc";
import type {
  Comment,
  CommentReaction,
} from "@cat/shared/schema/drizzle/comment";
import type { CommentReactionType } from "@cat/shared/schema/drizzle/enum";
import { usePageContext } from "vike-vue/usePageContext";
import { computed } from "vue";

const props = defineProps<{
  comment: Pick<Comment, "id">;
  reactions: Pick<CommentReaction, "userId" | "type">[];
  emoji: string;
  type: CommentReactionType;
}>();

const ctx = usePageContext();

const emits = defineEmits<{
  react: [reaction: CommentReaction];
  unReact: [userId: string];
}>();

const react = async () => {
  const reaction = await orpc.comment.react({
    commentId: props.comment.id,
    type: props.type,
  });
  emits("react", reaction);
};

const unReact = async () => {
  await orpc.comment.unReact({
    commentId: props.comment.id,
  });
  emits("unReact", ctx.user!.id);
};

const reacted = computed(() => {
  return props.reactions.some(
    (reaction) =>
      reaction.userId === ctx.user?.id && reaction.type === props.type,
  );
});
</script>

<template>
  <Button
    variant="ghost"
    size="icon-sm"
    @click="reacted ? unReact() : react()"
    class="size-6 cursor-pointer"
    >{{ emoji }}</Button
  >
</template>
