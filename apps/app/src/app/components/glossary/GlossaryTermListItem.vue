<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import type { TermRelation } from "@cat/shared";
import { useToastStore } from "@/app/stores/toast";
import Button from "@/app/components/Button.vue";
import TableCell from "@/app/components/table/TableCell.vue";
import TableRow from "@/app/components/table/TableRow.vue";

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
      ><Button icon="i-mdi:trash-can" no-text @click="handleDelete"
    /></TableCell>
  </TableRow>
</template>
