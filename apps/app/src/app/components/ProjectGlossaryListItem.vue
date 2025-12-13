<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/drizzle/glossary";
import { onMounted, ref } from "vue";
import { navigate } from "vike/client/router";
import { trpc } from "@cat/app-api/trpc/client";
import type { Project } from "@cat/shared/schema/drizzle/project";
import TableRow from "@/app/components/table/TableRow.vue";
import TableCell from "@/app/components/table/TableCell.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { watchClient } from "@/app/utils/vue.ts";
import { Button } from "@/app/components/ui/button";

const { info, trpcWarn } = useToastStore();

const termAmount = ref(-1);

const props = defineProps<{
  glossary: Glossary;
  project: Project;
}>();

const emits = defineEmits<{
  (e: "unlink"): void;
}>();

const updateTermAmount = async () => {
  await trpc.glossary.countTerm
    .query({
      glossaryId: props.glossary.id,
    })
    .then((amount) => (termAmount.value = amount));
};

const handleCheck = async () => {
  await navigate(`/glossary/${props.glossary.id}`);
};

const handleUnlink = async () => {
  await trpc.project.unlinkGlossary
    .mutate({
      projectId: props.project.id,
      glossaryIds: [props.glossary.id],
    })
    .then(() => {
      emits("unlink");
      info(`成功将术语库 ${props.glossary.name} 从项目中移除`);
    })
    .catch(trpcWarn);
};

watchClient(() => props.glossary, updateTermAmount);

onMounted(updateTermAmount);
</script>

<template>
  <TableRow class="cursor-pointer hover:bg-background" @click="handleCheck">
    <TableCell>{{ glossary.name }}</TableCell>
    <TableCell>{{ glossary.description }}</TableCell>
    <TableCell>{{ termAmount }}</TableCell>
    <TableCell>
      <Button size="icon" @click.stop="handleUnlink"
        ><div class="icon-[mdi--link-off] size-4"
      /></Button>
    </TableCell>
  </TableRow>
</template>
