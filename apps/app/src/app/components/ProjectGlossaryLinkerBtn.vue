<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { trpc } from "@cat/app-api/trpc/client";
import type { Project } from "@cat/shared/schema/drizzle/project";
import MultiGlossaryPicker from "./MultiGlossaryPicker.vue";
import Modal from "./headless/HModal.vue";
import HButton from "./headless/HButton.vue";
import { useToastStore } from "@/app/stores/toast.ts";

const { t } = useI18n();

const { info, trpcWarn } = useToastStore();

const emits = defineEmits(["link"]);

const props = defineProps<{
  project: Project;
}>();

const glossaryIds = ref<string[]>([]);

const isOpen = ref(false);

const handleOpen = () => {
  isOpen.value = true;
};

const handleLink = async () => {
  const createNewIndex = glossaryIds.value.findIndex(
    (id) => id === "createNew",
  );
  const realIds = glossaryIds.value.splice(createNewIndex, 1);

  if (createNewIndex !== -1) {
    await trpc.glossary.create.mutate({
      name: props.project.name,
      projectIds: [props.project.id],
    });
  }

  await trpc.project.linkGlossary
    .mutate({
      id: props.project.id,
      glossaryIds: realIds,
    })
    .then(() => {
      emits("link");
      info("成功连接新的术语库到此项目");
    })
    .catch(trpcWarn);
};
</script>

<template>
  <HButton
    icon="i-mdi:link"
    :classes="{
      base: 'btn btn-md btn-base',
    }"
    :class="$attrs.class"
    @click="handleOpen"
    >{{ t("连接术语库") }}</HButton
  >
  <Modal
    v-model="isOpen"
    :classes="{
      modal: 'modal',
      'modal-backdrop': 'modal-backdrop',
    }"
  >
    <h3 class="text-lg font-bold">{{ t("连接或创建新术语库") }}</h3>
    <MultiGlossaryPicker v-model="glossaryIds" full-width create-new />
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
