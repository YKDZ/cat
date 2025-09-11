<script setup lang="ts">
import { useToastStore } from "@/app/stores/toast";
import { trpc } from "@/server/trpc/client";
import type { Document } from "@cat/shared/schema/prisma/document";
import { computed, onMounted } from "vue";
import { useDocumentStore } from "../stores/document";
import Icon from "./Icon.vue";
import TableCell from "./table/TableCell.vue";
import TableRow from "./table/TableRow.vue";
import { navigate } from "vike/client/router";
import HButton from "./headless/HButton.vue";

const props = defineProps<{
  document: Document;
}>();

const { trpcWarn, info } = useToastStore();
const {
  updateDocumentFromFilePretreatmentTask,
  updateTranslatableEleAmount,
  translatableEleAmounts,
  tasks,
} = useDocumentStore();

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

const fileEmbeddingTask = computed(() => {
  return tasks
    .get(props.document.id)
    ?.find((task) => task.type === "document_from_file_pretreatment");
});

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
    <TableCell v-if="fileEmbeddingTask"
      ><Icon
        v-if="fileEmbeddingTask.status === 'pending'"
        icon="i-mdi:dots-horizontal" /><Icon
        v-else-if="fileEmbeddingTask.status === 'processing'"
        icon="i-mdi:loading"
        class="animate-spin" /><Icon
        v-else-if="fileEmbeddingTask.status === 'completed'"
        icon="i-mdi:check-circle-outline"
        class="color-base" /><Icon
        v-else-if="fileEmbeddingTask.status === 'failed'"
        icon="i-mdi:close-circle-outline"
        class="color-red"
    /></TableCell>
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
