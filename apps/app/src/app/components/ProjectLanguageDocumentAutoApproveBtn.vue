<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import type { Document } from "@cat/shared";
import { inject, ref } from "vue";
import { languageKey } from "../utils/provide";
import { useToastStore } from "../stores/toast";
import Modal from "./Modal.vue";
import Button from "./Button.vue";

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
  <Button no-text icon="i-mdi:auto-fix" @click.stop="isOpen = true" />
  <Modal v-model:is-open="isOpen">
    <div class="rounded-md p-10 bg-highlight flex flex-col gap-2">
      <h3 class="text-lg font-bold">自动批准</h3>
      <p>
        这将自动选出各个可翻译元素的翻译中<br />得票数最高的那一个，并自动批准它
      </p>
      <Button full-width @click="handleAutoApprove">确认</Button>
    </div>
  </Modal>
</template>
