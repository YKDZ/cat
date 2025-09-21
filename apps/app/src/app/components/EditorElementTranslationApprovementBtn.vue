<script setup lang="ts">
import type {
  Translation,
  TranslationApprovement,
} from "@cat/shared/schema/prisma/translation";
import { computed } from "vue";
import { trpc } from "@cat/app-api/trpc/client";
import HButton from "./headless/HButton.vue";

const props = defineProps<{
  translation: Translation & {
    Approvements: TranslationApprovement[];
  };
}>();

const isApproved = computed(() => {
  if (!props.translation.Approvements) return false;
  return (
    props.translation.Approvements.findIndex(
      (approvement) => approvement.isActive,
    ) !== -1
  );
});

const handleApprove = async () => {
  if (isApproved.value) return;

  await trpc.translation.approve.mutate({
    id: props.translation.id,
  });
};

const handleUnapprove = async () => {
  if (!isApproved.value) return;

  await trpc.translation.unapprove.mutate({
    id: props.translation.id,
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
      icon="i-mdi:check"
      @click.stop="handleApprove"
    />
    <HButton
      v-if="isApproved"
      :classes="{
        base: 'btn btn-md btn-transparent btn-square',
      }"
      icon="i-mdi:close"
      @click.stop="handleUnapprove"
    />
  </div>
</template>
