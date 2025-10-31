<script setup lang="ts">
import { computed } from "vue";
import { trpc } from "@cat/app-api/trpc/client";
import HButton from "./headless/HButton.vue";
import type { TranslationWithStatus } from "../stores/editor/translation";

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
    <HButton
      v-if="!isApproved"
      :classes="{
        base: 'btn btn-md btn-transparent btn-square',
      }"
      icon="icon-[mdi--check]"
      @click.stop="handleApprove"
    />
    <HButton
      v-if="isApproved"
      :classes="{
        base: 'btn btn-md btn-transparent btn-square',
      }"
      icon="icon-[mdi--close]"
      @click.stop="handleUnapprove"
    />
  </div>
</template>
