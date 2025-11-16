<script setup lang="ts">
import { Badge } from "@/app/components/ui/badge";
import { trpc } from "@cat/app-api/trpc/client";
import type {
  TranslatableElementCommentReaction,
  TranslatableElementComment,
} from "@cat/shared/schema/drizzle/document";
import type { TranslatableElementCommentReactionType } from "@cat/shared/schema/drizzle/enum";
import { usePageContext } from "vike-vue/usePageContext";
import { computed } from "vue";

const props = defineProps<{
  emoji: string;
  type: TranslatableElementCommentReactionType;
  comment: Pick<TranslatableElementComment, "id">;
  reactions: Pick<TranslatableElementCommentReaction, "type" | "userId">[];
}>();

const amount = computed(() => {
  return props.reactions.filter((reaction) => reaction.type === props.type)
    .length;
});

const ctx = usePageContext();

const emits = defineEmits<{
  react: [reaction: TranslatableElementCommentReaction];
  unReact: [userId: string];
}>();

const react = async () => {
  const reaction = await trpc.element.react.mutate({
    commentId: props.comment.id,
    type: props.type,
  });
  emits("react", reaction);
};

const unReact = async () => {
  await trpc.element.unReact.mutate({
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
