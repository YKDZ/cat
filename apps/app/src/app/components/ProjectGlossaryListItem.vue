<script setup lang="ts">
import type { Glossary } from "@cat/shared";
import TableRow from "@/app/components/table/TableRow.vue";
import TableCell from "@/app/components/table/TableCell.vue";
import { inject, onMounted, ref, watch } from "vue";
import { trpc } from "@/server/trpc/client";
import { projectKey } from "@/app/utils/provide";
import { navigate } from "vike/client/router";
import Button from "./Button.vue";
import { useToastStore } from "../stores/toast";

const { info, trpcWarn } = useToastStore();

const project = inject(projectKey);

const termAmount = ref(-1);

const props = defineProps<{
  glossary: Glossary;
}>();

const emits = defineEmits<{
  (e: "unlink"): void;
}>();

const updateTermAmount = async () => {
  await trpc.glossary.countTerm
    .query({
      id: props.glossary.id,
    })
    .then((amount) => (termAmount.value = amount));
};

const handleCheck = () => {
  navigate(`/glossary/${props.glossary.id}`);
};

const handleUnlink = async () => {
  if (!project || !project.value) return;

  await trpc.project.unlinkGlossary
    .mutate({
      id: project.value.id,
      glossaryIds: [props.glossary.id],
    })
    .then(() => {
      emits("unlink");
      info(`成功将术语库 ${props.glossary.name} 从项目中移除`);
    })
    .catch(trpcWarn);
};

watch(() => props.glossary, updateTermAmount);

onMounted(updateTermAmount);
</script>

<template>
  <TableRow
    class="cursor-pointer hover:bg-highlight-darker"
    @click="handleCheck"
  >
    <TableCell>{{ glossary.name }}</TableCell>
    <TableCell>{{ glossary.description }}</TableCell>
    <TableCell>{{ termAmount }}</TableCell>
    <TableCell>
      <Button no-text icon="i-mdi:link-off" @click.stop="handleUnlink" />
    </TableCell>
  </TableRow>
</template>
