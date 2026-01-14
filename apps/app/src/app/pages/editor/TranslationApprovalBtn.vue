<script setup lang="ts">
import { orpc } from "@/server/orpc";
import type { TranslationWithStatus } from "@/app/stores/editor/translation";
import { Button } from "@/app/components/ui/button";
import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";
import { useI18n } from "vue-i18n";
import { useEditorTableStore } from "@/app/stores/editor/table";
import { computed } from "vue";
import { storeToRefs } from "pinia";

const { t } = useI18n();

const props = defineProps<{
  translation: Pick<TranslationWithStatus, "id">;
}>();

const { element } = storeToRefs(useEditorTableStore());

const isApproved = computed<boolean>(() => {
  return element?.value?.approvedTranslationId === props.translation.id;
});

const handleApprove = async () => {
  if (isApproved.value) return;

  await orpc.translation.approve({
    translationId: props.translation.id,
  });

  element.value!.approvedTranslationId = props.translation.id;
};

const handleUnapprove = async () => {
  if (!isApproved.value) return;

  await orpc.translation.unapprove({
    translationId: props.translation.id,
  });

  element.value!.approvedTranslationId = null;
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
