<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import type { Translation, TranslationApprovement } from "@cat/shared";
import { useEditorStore } from "../stores/editor";
import { useToastStore } from "../stores/toast";
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import HButton from "./headless/HButton.vue";

const props = defineProps<{
  translation: Translation;
}>();

const { t } = useI18n();
const { info, trpcWarn } = useToastStore();
const { upsertTranslation, updateElementStatus } = useEditorStore();
const { translations } = storeToRefs(useEditorStore());

const isApproved = computed(() => {
  if (!props.translation.Approvements) return false;
  return (
    props.translation.Approvements.findIndex(
      (approvment) => approvment.isActive,
    ) !== -1
  );
});

const handleChangeApprovement = (
  id: number,
  approvement: TranslationApprovement,
) => {
  const originIndex = translations.value.findIndex(
    (translation) => translation.id === id,
  );

  if (originIndex === -1) return;

  const origin = translations.value.at(originIndex);

  if (!origin) return;

  const newTranslation = {
    ...origin,
    Approvements: [...origin.Approvements!, approvement],
  } satisfies Translation;

  upsertTranslation(newTranslation);
  updateElementStatus(newTranslation.translatableElementId).catch(trpcWarn);
};

const handleApprove = async () => {
  if (isApproved.value) return;

  await trpc.translation.approve
    .mutate({
      id: props.translation.id,
    })
    .then((approvement) => {
      handleChangeApprovement(props.translation.id, approvement);
      info(t("成功批准"));
    })
    .catch(trpcWarn);
};

const handleUnapprove = async () => {
  if (!isApproved.value) return;

  await trpc.translation.unapprove
    .mutate({
      id: props.translation.id,
    })
    .then((approvement) => {
      handleChangeApprovement(props.translation.id, approvement);
      info(t("成功取消批准"));
    })
    .catch(trpcWarn);
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
