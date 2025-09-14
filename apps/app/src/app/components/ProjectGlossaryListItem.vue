<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/prisma/glossary";
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

const handleCheck = async () => {
  await navigate(`/glossary/${props.glossary.id}`);
};

const handleUnlink = async () => {
  if (!project) return;

  await trpc.project.unlinkGlossary
    .mutate({
      id: project.id,
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
      <HButton
        :classes="{
          base: 'btn btn-md btn-square',
        }"
        icon="i-mdi:link-off"
        @click.stop="handleUnlink"
      />
    </TableCell>
  </TableRow>
</template>
