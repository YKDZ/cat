<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import HButton from "./headless/HButton.vue";
import GlossaryInsertTermText from "@/app/components/GlossaryInsertTermText.vue";
import SModal from "./headless-styled/SModal.vue";

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
    icon="icon-[mdi--plus]"
    @click="isOpen = true"
    >{{ t("插入术语") }}</HButton
  >
  <SModal v-model="isOpen">
    <GlossaryInsertTermText :glossary-id />
  </SModal>
</template>
