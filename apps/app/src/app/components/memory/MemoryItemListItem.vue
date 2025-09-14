<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import type { MemoryItem } from "@cat/shared/schema/prisma/memory";
import { useToastStore } from "@/app/stores/toast.ts";
import TableCell from "@/app/components/table/TableCell.vue";
import TableRow from "@/app/components/table/TableRow.vue";
import { useI18n } from "vue-i18n";
import HButton from "@/app/components/headless/HButton.vue";

const { info, trpcWarn } = useToastStore();
const { t } = useI18n();

const props = defineProps<{
  item: MemoryItem;
}>();

const emits = defineEmits<{
  (e: "delete"): void;
}>();

const handleDelete = async () => {
  await trpc.memory.deleteItems
    .mutate({
      ids: [props.item.id],
    })
    .then(() => {
      info(
        t("成功删除记忆条目 {translation}", { term: props.item.translation }),
      );
      emits("delete");
    })
    .catch(trpcWarn);
};
</script>

<template>
  <TableRow>
    <TableCell>{{ item.source }}</TableCell>
    <TableCell>{{ item.translation }}</TableCell>
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
