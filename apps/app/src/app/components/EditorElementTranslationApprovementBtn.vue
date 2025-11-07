<script setup lang="ts">
import { computed } from "vue";
import { trpc } from "@cat/app-api/trpc/client";
import type { TranslationWithStatus } from "../stores/editor/translation";
import { Button } from "@/app/components/ui/button";

const props = defineProps<{
  translation: Pick<TranslationWithStatus, "id">;
}>();

const isApproved = computed(() => {
  return true;
});

const handleApprove = async () => {
  if (isApproved.value) return;

  await trpc.translation.approve.mutate({
    translationId: props.translation.id,
  });
};

const handleUnapprove = async () => {
  if (!isApproved.value) return;

  await trpc.translation.unapprove.mutate({
    translationId: props.translation.id,
  });
};
</script>

<template>
  <div class="flex gap-1 items-center">
    <Button v-if="!isApproved" size="icon" @click.stop="handleApprove">
      <div class="icon-[mdi--check] size-4" />
    </Button>
    <Button
      v-if="isApproved"
      variant="ghost"
      size="icon"
      @click.stop="handleUnapprove"
    >
      <div class="icon-[mdi--close] size-4" />
    </Button>
  </div>
</template>
