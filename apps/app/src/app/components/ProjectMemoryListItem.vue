<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/prisma/glossary";
import type { Memory } from "@cat/shared/schema/prisma/memory";
import { inject, onMounted, ref, watch } from "vue";
import { navigate } from "vike/client/router";
import HButton from "./headless/HButton.vue";
import TableRow from "@/app/components/table/TableRow.vue";
import TableCell from "@/app/components/table/TableCell.vue";
import { trpc } from "@/server/trpc/client.ts";
import { projectKey } from "@/app/utils/provide.ts";
import { useToastStore } from "@/app/stores/toast.ts";

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
