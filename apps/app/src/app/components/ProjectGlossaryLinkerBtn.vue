<script setup lang="ts">
import { inject, ref } from "vue";
import MultiGlossaryPicker from "./MultiGlossaryPicker.vue";
import Button from "./Button.vue";
import { trpc } from "@/server/trpc/client";
import { projectKey } from "../utils/provide";
import { useToastStore } from "../stores/toast";
import Modal from "./Modal.vue";

const { info, trpcWarn } = useToastStore();

const emits = defineEmits(["link"]);

const project = inject(projectKey);

const glossaryIds = ref<string[]>([]);

const isOpen = ref(false);

const handleOpen = () => {
  isOpen.value = true;
};

const handleLink = async () => {
  if (!project || !project.value) return;

  const createNewIndex = glossaryIds.value.findIndex(
    (id) => id === "createNew",
  );
  const realIds = glossaryIds.value.splice(createNewIndex, 1);

  if (createNewIndex !== -1) {
    await trpc.glossary.create.mutate({
      name: project.value.name,
      projectIds: [project.value.id],
    });
  }

  await trpc.project.linkGlossary
    .mutate({
      id: project.value.id,
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
  <Button icon="i-mdi:link" :class="$attrs.class" @click="handleOpen">{{
    $t("连接术语库")
  }}</Button>
  <Modal v-model:is-open="isOpen">
    <div class="p-8 rounded-md bg-highlight flex flex-col gap-3">
      <h3 class="text-lg font-bold">{{ $t("连接或创建新术语库") }}</h3>
      <MultiGlossaryPicker
        v-model:glossary-ids="glossaryIds"
        full-width
        create-new
      />
      <Button full-width icon="i-mdi:link" @click="handleLink">{{
        $t("连接")
      }}</Button>
    </div></Modal
  >
</template>
