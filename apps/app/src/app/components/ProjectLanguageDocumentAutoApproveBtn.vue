<script setup lang="ts">
import type { Document } from "@cat/shared/schema/prisma/document";
import { inject, ref } from "vue";
import { useI18n } from "vue-i18n";
import Modal from "./headless/HModal.vue";
import HButton from "./headless/HButton.vue";
import { languageKey } from "@/app/utils/provide.ts";
import { useToastStore } from "@/app/stores/toast.ts";
import { trpc } from "@cat/app-api/trpc/client";

const { t } = useI18n();

const props = defineProps<{
  document: Document;
}>();

const { info, trpcWarn } = useToastStore();

const language = inject(languageKey);
const isOpen = ref(false);

const handleAutoApprove = async () => {
  if (!language || !language.value) return;

  await trpc.translation.autoApprove
    .mutate({
      documentId: props.document.id,
      languageId: language.value.id,
    })
    .then((count) => {
      isOpen.value = false;
      info(`成功自动批准 ${count} 条可用的翻译`);
    })
    .catch(trpcWarn);
};
</script>

<template>
  <HButton
    :classes="{
      base: 'btn btn-md btn-base btn-square',
      icon: 'btn-icon btn-icon-md',
    }"
    icon="i-mdi:auto-fix"
    @click.stop="isOpen = true"
  />
  <Modal
    v-model="isOpen"
    :classes="{
      modal: 'modal',
      'modal-backdrop': 'modal-backdrop',
    }"
  >
    <article class="prose-highlight-content max-w-460px prose">
      <h3 class="text-highlight-content-darker">{{ t("自动批准") }}</h3>
      <p>
        {{
          t(
            "这将自动选出各个可翻译元素的翻译中得票数最高的那一个，并自动批准它。",
          )
        }}
      </p>
    </article>
    <HButton
      :classes="{
        base: 'btn btn-md btn-base btn-center btn-w-full',
      }"
      @click="handleAutoApprove"
      >确认</HButton
    >
  </Modal>
</template>
