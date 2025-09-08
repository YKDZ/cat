<script setup lang="ts">
import type { Glossary, Memory } from "@cat/shared";
import TableRow from "@/app/components/table/TableRow.vue";
import TableCell from "@/app/components/table/TableCell.vue";
import { inject, onMounted, ref, watch } from "vue";
import { trpc } from "@/server/trpc/client";
import { projectKey } from "@/app/utils/provide";
import { navigate } from "vike/client/router";
import { useToastStore } from "../stores/toast";
import HButton from "./headless/HButton.vue";

const { info, trpcWarn } = useToastStore();

const project = inject(projectKey);

const itemAmount = ref(-1);

const props = defineProps<{
  memory: Memory;
}>();

const emits = defineEmits<{
  (e: "unlink"): void;
}>();

const updateTermAmount = async () => {
  await trpc.memory.countItem
    .query({
      id: props.memory.id,
    })
    .then((amount) => (itemAmount.value = amount));
};

const handleCheck = async () => {
  await navigate(`/memory/${props.memory.id}`);
};

const handleUnlink = async () => {
  if (!project || !project.value) return;

  await trpc.project.unlinkMemory
    .mutate({
      id: project.value.id,
      memoryIds: [props.memory.id],
    })
    .then(() => {
      emits("unlink");
      info(`成功将记忆库 ${props.memory.name} 从项目中移除`);
    })
    .catch(trpcWarn);
};

watch(() => props.memory, updateTermAmount);

onMounted(updateTermAmount);
</script>

<template>
  <TableRow
    class="cursor-pointer hover:bg-highlight-darker"
    @click="handleCheck"
  >
    <TableCell>{{ memory.name }}</TableCell>
    <TableCell>{{ memory.description }}</TableCell>
    <TableCell>{{ itemAmount }}</TableCell>
    <TableCell>
      <HButton
        :classes="{
          base: 'btn btn-md btn-base btn-square',
        }"
        icon="i-mdi:link-off"
        @click.stop="handleUnlink"
      />
    </TableCell>
  </TableRow>
</template>
