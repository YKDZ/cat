<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import type { Project } from "@cat/shared/schema/drizzle/project";

import { TableRow, TableCell } from "@cat/ui";
import { Button } from "@cat/ui";
import { navigate } from "vike/client/router";
import { onMounted, ref } from "vue";

import { orpc } from "@/app/rpc/orpc";
import { useToastStore } from "@/app/stores/toast.ts";
import { watchClient } from "@/app/utils/vue.ts";

const { info, rpcWarn } = useToastStore();

const itemAmount = ref(-1);

const props = defineProps<{
  memory: Memory;
  project: Project;
}>();

const emits = defineEmits<{
  (e: "unlink"): void;
}>();

const updateTermAmount = async () => {
  await orpc.memory
    .countItem({
      memoryId: props.memory.id,
    })
    .then((amount) => (itemAmount.value = amount));
};

const handleCheck = async () => {
  await navigate(`/memory/${props.memory.id}`);
};

const handleUnlink = async () => {
  await orpc.project
    .unlinkMemory({
      projectId: props.project.id,
      memoryIds: [props.memory.id],
    })
    .then(() => {
      emits("unlink");
      info(`成功将记忆库 ${props.memory.name} 从项目中移除`);
    })
    .catch(rpcWarn);
};

watchClient(() => props.memory, updateTermAmount);

onMounted(updateTermAmount);
</script>

<template>
  <TableRow class="cursor-pointer hover:bg-background" @click="handleCheck">
    <TableCell>{{ memory.name }}</TableCell>
    <TableCell>{{ memory.description }}</TableCell>
    <TableCell>{{ itemAmount }}</TableCell>
    <TableCell>
      <Button @click.stop="handleUnlink" size="icon"
        ><div class="icon-[mdi--link-off] size-4"
      /></Button>
    </TableCell>
  </TableRow>
</template>
