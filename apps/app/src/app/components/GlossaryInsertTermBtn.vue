<script setup lang="ts">
import { ref } from "vue";

import { useI18n } from "vue-i18n";
import HButton from "./headless/HButton.vue";
import Modal from "@/app/components/Modal.vue";
import GlossaryInsertTermText from "@/app/components/GlossaryInsertTermText.vue";

const { t } = useI18n();

const props = defineProps<{
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
  <Modal v-model:is-open="isOpen">
    <div class="px-10 py-6 rounded-sm bg-highlight">
      <GlossaryInsertTermText :glossary-id />
    </div>
  </Modal>
</template>
