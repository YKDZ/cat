<script setup lang="ts">
import { ref } from "vue";
import Button from "@/app/components/Button.vue";
import Modal from "@/app/components/Modal.vue";
import GlossaryInsertTermText from "@/app/components/GlossaryInsertTermText.vue";

const props = defineProps<{
  glossaryId: string;
}>();

const isOpen = ref(false);
</script>

<template>
  <Button icon="i-mdi:plus" @click="isOpen = true">插入术语</Button>
  <Modal v-model:is-open="isOpen">
    <div class="px-10 py-6 rounded-sm bg-highlight">
      <GlossaryInsertTermText :glossary-id />
    </div>
  </Modal>
</template>
