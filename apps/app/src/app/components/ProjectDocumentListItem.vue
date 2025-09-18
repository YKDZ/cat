<script setup lang="ts">
import type { Document } from "@cat/shared/schema/prisma/document";
import { navigate } from "vike/client/router";
import TableCell from "./table/TableCell.vue";
import TableRow from "./table/TableRow.vue";
import HButton from "./headless/HButton.vue";
import { trpc } from "@/server/trpc/client.ts";
import { useToastStore } from "@/app/stores/toast.ts";

const props = defineProps<{
  document: Document;
}>();

const { trpcWarn, info } = useToastStore();

const emits = defineEmits<{
  (e: "delete"): void;
}>();

const handleDelete = async () => {
  const id = props.document.id;

  await trpc.document.delete
    .mutate({
      id,
    })
    .then(() => {
      emits("delete");
      info("成功删除文档 " + props.document.File?.originName);
    })
    .catch(trpcWarn);
};

const handleClick = async () => {
  await navigate(`/document/${props.document.id}`);
};
</script>

<template>
  <TableRow
    class="cursor-pointer hover:bg-highlight-darker"
    @click="handleClick"
  >
    <TableCell>{{ document.File?.originName }}</TableCell>
    <TableCell>
      <HButton
        icon="i-mdi:trash-can"
        :classes="{
          base: 'btn btn-md btn-base btn-square',
        }"
        @click.stop="handleDelete"
      />
    </TableCell>
  </TableRow>
</template>
