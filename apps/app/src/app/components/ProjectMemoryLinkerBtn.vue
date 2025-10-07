<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { trpc } from "@cat/app-api/trpc/client";
import type { Project } from "@cat/shared/schema/drizzle/project";
import Modal from "./headless/HModal.vue";
import MultiMemoryPicker from "./MultiMemoryPicker.vue";
import HButton from "./headless/HButton.vue";
import { useToastStore } from "@/app/stores/toast.ts";

const { t } = useI18n();
const { info, trpcWarn } = useToastStore();

const props = defineProps<{
  project: Project;
}>();

const emits = defineEmits(["link"]);

const memoryIds = ref<string[]>([]);

const isOpen = ref(false);

const handleOpen = () => {
  isOpen.value = true;
};

const handleLink = async () => {
  const createNewIndex = memoryIds.value.findIndex((id) => id === "createNew");
  const realIds = memoryIds.value.splice(createNewIndex, 1);

  if (createNewIndex !== -1) {
    await trpc.memory.create.mutate({
      name: props.project.name,
      projectIds: [props.project.id],
    });
  }

  await trpc.project.linkMemory
    .mutate({
      id: props.project.id,
      memoryIds: realIds,
    })
    .then(() => {
      emits("link");
      info("成功连接新的记忆库到此项目");
    })
    .catch(trpcWarn);
};
</script>

<template>
  <HButton
    :classes="{
      base: 'btn btn-md btn-base',
    }"
    icon="i-mdi:link"
    :class="$attrs.class"
    @click="handleOpen"
    >{{ t("连接记忆库") }}</HButton
  >
  <Modal
    v-model="isOpen"
    :classes="{
      modal: 'modal',
      'modal-backdrop': 'modal-backdrop',
    }"
  >
    <h3 class="text-lg font-bold">{{ t("连接或创建新记忆库") }}</h3>
    <MultiMemoryPicker v-model="memoryIds" full-width create-new />
    <HButton
      :classes="{
        base: 'btn btn-md btn-base btn-w-full',
      }"
      icon="i-mdi:link"
      @click="handleLink"
      >{{ t("连接") }}</HButton
    >
  </Modal>
</template>
