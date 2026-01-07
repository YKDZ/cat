<script setup lang="ts">
import { Badge } from "@/app/components/ui/badge";
import { orpc } from "@/server/orpc";
import type {
  CommentReaction,
  Comment,
} from "@cat/shared/schema/drizzle/comment";
import type { CommentReactionType } from "@cat/shared/schema/drizzle/enum";
import { usePageContext } from "vike-vue/usePageContext";
import { computed } from "vue";

const props = defineProps<{
  emoji: string;
  type: CommentReactionType;
  comment: Pick<Comment, "id">;
  reactions: Pick<CommentReaction, "type" | "userId">[];
}>();

const amount = computed(() => {
  return props.reactions.filter((reaction) => reaction.type === props.type)
    .length;
});

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
  <Badge
    v-if="amount > 0"
    @click="reacted ? unReact() : react()"
    class="cursor-pointer"
    :class="{
      'bg-muted text-muted-foreground': !reacted,
      'bg-muted-foreground/10 text-muted-foreground': reacted,
    }"
    >{{ emoji }}{{ amount }}</Badge
  >
</template>
