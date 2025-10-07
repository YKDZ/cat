<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import type { Project } from "@cat/shared/schema/drizzle/project";
import Modal from "./headless/HModal.vue";
import ProjectUploadFiles from "./ProjectUploadFiles.vue";
import HButton from "./headless/HButton.vue";

const { t } = useI18n();

const isOpen = ref(false);

defineProps<{
  project: Project;
}>();
</script>

<template>
  <HButton
    :classes="{
      base: 'btn btn-md btn-base',
    }"
    icon="i-mdi:plus"
    :class="$attrs.class"
    @click="isOpen = true"
    >{{ t("上传文件") }}</HButton
  >
  <Modal
    v-if="project"
    v-model="isOpen"
    :classes="{
      modal: 'modal',
      'modal-backdrop': 'modal-backdrop',
    }"
  >
    <ProjectUploadFiles :project />
  </Modal>
</template>
