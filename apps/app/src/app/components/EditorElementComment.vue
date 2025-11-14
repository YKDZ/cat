<script setup lang="ts">
import Markdown from "@/app/components/Markdown.vue";
import UserAvatar from "@/app/components/UserAvatar.vue";
import type { TranslatableElementComment } from "@cat/shared/schema/drizzle/document";

defineProps<{
  comment: Pick<TranslatableElementComment, "userId" | "content">;
}>();
</script>

<template>
  <div class="flex gap-2 items-start w-full">
    <UserAvatar :user-id="comment.userId" :size="32" class="shrink-0" />
    <div class="relative inline-block w-full outline rounded-xs">
      <span
        class="absolute top-2 outline -left-1 w-3 h-3 rotate-45 bg-muted"
        aria-hidden="true"
      ></span>
      <Markdown
        :content="comment.content"
        class="relative bg-muted px-2 py-1 w-full"
      />
    </div>
  </div>
</template>
