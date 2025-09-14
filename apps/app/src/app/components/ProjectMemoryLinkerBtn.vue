<script setup lang="ts">
import { inject, ref } from "vue";
import { useI18n } from "vue-i18n";
import Modal from "./Modal.vue";
import MultiMemoryPicker from "./MultiMemoryPicker.vue";
import HButton from "./headless/HButton.vue";
import { trpc } from "@/server/trpc/client.ts";
import { projectKey } from "@/app/utils/provide.ts";
import { useToastStore } from "@/app/stores/toast.ts";

const { t } = useI18n();

const { info, trpcWarn } = useToastStore();

const emits = defineEmits(["link"]);

const project = inject(projectKey);

const memoryIds = ref<string[]>([]);

const isOpen = ref(false);

const handleOpen = () => {
  isOpen.value = true;
};

const handleLink = async () => {
  if (!project) return;

  const createNewIndex = memoryIds.value.findIndex((id) => id === "createNew");
  const realIds = memoryIds.value.splice(createNewIndex, 1);

  if (createNewIndex !== -1) {
    await trpc.memory.create.mutate({
      name: project.name,
      projectIds: [project.id],
    });
  }

  await trpc.project.linkMemory
    .mutate({
      id: project.id,
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
  <Modal v-model:is-open="isOpen">
    <div class="p-8 rounded-md bg-highlight flex flex-col gap-3">
      <h3 class="text-lg font-bold">{{ t("连接或创建新记忆库") }}</h3>
      <MultiMemoryPicker v-model:memory-ids="memoryIds" full-width create-new />
      <HButton
        :classes="{
          base: 'btn btn-md btn-base btn-w-full',
        }"
        icon="i-mdi:link"
        @click="handleLink"
        >{{ t("连接") }}</HButton
      >
    </div></Modal
  >
</template>
