<script setup lang="ts">
import { trpc } from "@cat/app-api/trpc/client";
import type { TranslationWithStatus } from "../stores/editor/translation";
import { Button } from "@/app/components/ui/button";
import { computedAsync } from "@vueuse/core";
import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{
  translation: Pick<TranslationWithStatus, "id">;
}>();

const isApproved = computedAsync(async () => {
  return await trpc.translation.isApproved.query({
    translationId: props.translation.id,
  });
}, false);

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
  <TextTooltip :tooltip="isApproved ? t('撤销批准') : t('批准')">
    <Button
      v-if="!isApproved"
      variant="ghost"
      size="icon"
      @click.stop="handleApprove"
    >
      <div class="icon-[mdi--check] size-4" />
    </Button>
    <Button v-else variant="ghost" size="icon" @click.stop="handleUnapprove">
      <div class="icon-[mdi--close] size-4" /> </Button
  ></TextTooltip>
</template>
