<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import { onMounted, ref } from "vue";
import { navigate } from "vike/client/router";
import { trpc } from "@cat/app-api/trpc/client";
import type { Project } from "@cat/shared/schema/drizzle/project";
import HButton from "./headless/HButton.vue";
import TableRow from "@/app/components/table/TableRow.vue";
import TableCell from "@/app/components/table/TableCell.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { watchClient } from "@/app/utils/vue.ts";

const { info, trpcWarn } = useToastStore();

const itemAmount = ref(-1);

const props = defineProps<{
  memory: Memory;
  project: Project;
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
  await trpc.project.unlinkMemory
    .mutate({
      id: props.project.id,
      memoryIds: [props.memory.id],
    })
    .then(() => {
      emits("unlink");
      info(`成功将记忆库 ${props.memory.name} 从项目中移除`);
    })
    .catch(trpcWarn);
};

watchClient(() => props.memory, updateTermAmount);

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
