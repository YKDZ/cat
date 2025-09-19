<script setup lang="ts">
import type { TermRelation } from "@cat/shared/schema/prisma/glossary";
import { trpc } from "@cat/app-api/trpc/client";
import { useToastStore } from "@/app/stores/toast.ts";
import TableCell from "@/app/components/table/TableCell.vue";
import TableRow from "@/app/components/table/TableRow.vue";
import HButton from "@/app/components/headless/HButton.vue";

const { info, trpcWarn } = useToastStore();

const props = defineProps<{
  term: TermRelation;
}>();

const emits = defineEmits<{
  (e: "delete"): void;
}>();

const handleDelete = async () => {
  await trpc.glossary.deleteTerm
    .mutate({
      ids: [props.term.termId],
    })
    .then(() => {
      info(`成功删除术语 ${props.term.Term?.value}`);
      emits("delete");
    })
    .catch(trpcWarn);
};
</script>

<template>
  <TableRow>
    <TableCell>{{ term.Term?.value }}</TableCell>
    <TableCell>{{ term.Translation?.value }}</TableCell>
    <TableCell
      ><HButton
        :classes="{
          base: 'btn btn-md btn-base btn-square',
        }"
        icon="i-mdi:trash-can"
        no-text
        @click="handleDelete"
    /></TableCell>
  </TableRow>
</template>
