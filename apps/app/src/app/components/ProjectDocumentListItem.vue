<script setup lang="ts">
import type { Document } from "@cat/shared/schema/prisma/document";
import { onMounted } from "vue";
import { navigate } from "vike/client/router";
import Icon from "./Icon.vue";
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

onMounted(() => {
  updateTranslatableEleAmount(props.document.id);
  updateDocumentFromFilePretreatmentTask(props.document.id);
});
</script>

<template>
  <TableRow
    class="cursor-pointer hover:bg-highlight-darker"
    @click="handleClick"
  >
    <TableCell>{{ document.File?.originName }}</TableCell>
    <TableCell>
      <span v-if="translatableEleAmounts.get(document.id) === -1"
        ><Icon small icon="i-mdi:loading animate-spin"
      /></span>
      <span v-else>{{ translatableEleAmounts.get(document.id) }}</span>
    </TableCell>
    <TableCell>
      <HButton
        icon="i-mdi:trash-can"
        :classes="{
          base: 'btn btn-md btn-base btn-square',
        }"
        @click="handleDelete"
      />
    </TableCell>
  </TableRow>
</template>
