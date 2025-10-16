<script setup lang="ts">
import type { Document } from "@cat/shared/schema/drizzle/document";
import { navigate } from "vike/client/router";
import { trpc } from "@cat/app-api/trpc/client";
import TableCell from "./table/TableCell.vue";
import TableRow from "./table/TableRow.vue";
import HButton from "./headless/HButton.vue";
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
      info("成功删除文档 " + props.document.name);
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
    <TableCell>{{ document.name }}</TableCell>
    <TableCell>
      <HButton
        icon="icon-[mdi--trash-can]"
        :classes="{
          base: 'btn btn-md btn-base btn-square',
        }"
        @click.stop="handleDelete"
      />
    </TableCell>
  </TableRow>
</template>
