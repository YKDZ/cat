<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/prisma/glossary";
import { onMounted, ref } from "vue";
import { navigate } from "vike/client/router";
import { trpc } from "@cat/app-api/trpc/client";
import type { Project } from "@cat/shared/schema/prisma/project";
import HButton from "./headless/HButton.vue";
import TableRow from "@/app/components/table/TableRow.vue";
import TableCell from "@/app/components/table/TableCell.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { watchClient } from "@/app/utils/vue.ts";

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
      id: props.glossary.id,
    })
    .then((amount) => (termAmount.value = amount));
};

const handleCheck = async () => {
  await navigate(`/glossary/${props.glossary.id}`);
};

const handleUnlink = async () => {
  await trpc.project.unlinkGlossary
    .mutate({
      id: props.project.id,
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
