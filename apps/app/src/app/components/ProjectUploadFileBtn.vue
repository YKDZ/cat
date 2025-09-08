<script setup lang="ts">
import { inject, ref } from "vue";
import Modal from "./Modal.vue";
import ProjectUploadFiles from "./ProjectUploadFiles.vue";
import { projectKey } from "../utils/provide";
import { useI18n } from "vue-i18n";
import HButton from "./headless/HButton.vue";

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
  <Modal v-if="project" v-model:is-open="isOpen"
    ><div class="px-10 py-6 rounded-sm bg-highlight">
      <ProjectUploadFiles v-model:project="project" />
    </div>
  </Modal>
</template>
