<script setup lang="ts">
import type {
  Translation,
  TranslationApprovement,
} from "@cat/shared/schema/prisma/translation";
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import { trpc } from "@cat/app-api/trpc/client";
import HButton from "./headless/HButton.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { useEditorStore } from "@/app/stores/editor.ts";

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
      (approvement) => approvement.isActive,
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

  const origin = translations.value[originIndex];

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
