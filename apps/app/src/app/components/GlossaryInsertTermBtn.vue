<script setup lang="ts">
import { ref } from "vue";

import { useI18n } from "vue-i18n";
import HButton from "./headless/HButton.vue";
import Modal from "@/app/components/headless/HModal.vue";
import GlossaryInsertTermText from "@/app/components/GlossaryInsertTermText.vue";

const { t } = useI18n();

defineProps<{
  glossaryId: string;
}>();

const isOpen = ref(false);
</script>

<template>
  <HButton
    :classes="{
      base: 'btn btn-md btn-base',
    }"
    icon="i-mdi:plus"
    @click="isOpen = true"
    >{{ t("插入术语") }}</HButton
  >
  <Modal
    v-model="isOpen"
    :classes="{
      modal: 'modal',
      'modal-backdrop': 'modal-backdrop',
    }"
  >
    <GlossaryInsertTermText :glossary-id />
  </Modal>
</template>
