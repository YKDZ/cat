<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import Button from "./Button.vue";
import type { Translation, TranslationApprovment } from "@cat/shared";
import { useEditorStore } from "../stores/editor";
import { useToastStore } from "../stores/toast";
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  translation: Translation;
}>();

const { t } = useI18n();
const { info, trpcWarn } = useToastStore();
const { upsertTranslation, updateElementStatus } = useEditorStore();
const { translations } = storeToRefs(useEditorStore());

const isApproved = computed(() => {
  if (!props.translation.Approvments) return false;
  return (
    props.translation.Approvments.findIndex(
      (approvment) => approvment.isActive,
    ) !== -1
  );
});

const handleChangeApprovment = (
  id: number,
  approvment: TranslationApprovment,
) => {
  const originIndex = translations.value.findIndex(
    (translation) => translation.id === id,
  );

  if (originIndex === -1) return;

  const origin = translations.value.at(originIndex);

  if (!origin) return;

  const newTransaltion = {
    ...origin,
    Approvments: [...origin.Approvments!, approvment],
  } satisfies Translation;

  upsertTranslation(newTransaltion);
  updateElementStatus(newTransaltion.translatableElementId).catch(trpcWarn);
};

const handleApprove = async () => {
  if (isApproved.value) return;

  await trpc.translation.approve
    .mutate({
      id: props.translation.id,
    })
    .then((approvement) => {
      handleChangeApprovment(props.translation.id, approvement);
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
      handleChangeApprovment(props.translation.id, approvement);
      info(t("成功取消批准"));
    })
    .catch(trpcWarn);
};
</script>

<template>
  <div class="flex gap-1 items-center">
    <Button
      v-if="!isApproved"
      no-text
      transparent
      icon="i-mdi:check"
      @click.stop="handleApprove"
    />
    <Button
      v-if="isApproved"
      no-text
      transparent
      icon="i-mdi:close"
      @click.stop="handleUnapprove"
    />
  </div>
</template>
