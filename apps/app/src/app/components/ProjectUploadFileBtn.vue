<script setup lang="ts">
import { inject, ref } from "vue";
import { useI18n } from "vue-i18n";
import Modal from "./headless/HModal.vue";
import ProjectUploadFiles from "./ProjectUploadFiles.vue";
import HButton from "./headless/HButton.vue";
import { projectKey } from "@/app/utils/provide.ts";

const { t } = useI18n();

const isOpen = ref(false);

const project = inject(projectKey);
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
    <ProjectUploadFiles v-model:project="project" />
  </Modal>
</template>
