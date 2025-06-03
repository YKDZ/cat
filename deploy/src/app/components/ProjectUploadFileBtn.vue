<script setup lang="ts">
import { inject, ref } from "vue";
import Button from "./Button.vue";
import Modal from "./Modal.vue";
import ProjectUploadFiles from "./ProjectUploadFiles.vue";
import { projectKey } from "../utils/provide";

const isOpen = ref(false);

const project = inject(projectKey);
</script>

<template>
  <Button icon="i-mdi:plus" :class="$attrs.class" @click="isOpen = true"
    >上传文件</Button
  >
  <Modal v-if="project" v-model:is-open="isOpen"
    ><div class="px-10 py-6 rounded-sm bg-highlight">
      <ProjectUploadFiles v-model:project="project" />
    </div>
  </Modal>
</template>
