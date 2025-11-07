<script setup lang="ts">
import { ref } from "vue";
import { trpc } from "@cat/app-api/trpc/client";
import TableCell from "@/app/components/table/TableCell.vue";
import TableRow from "@/app/components/table/TableRow.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { formatSize, uploadFileToS3PresignedURL } from "@/app/utils/file.ts";
import LanguagePicker from "./LanguagePicker.vue";
import { Button } from "@/app/components/ui/button";

const { info } = useToastStore();

const props = defineProps<{
  projectId: string;
  file: File;
}>();

const isProcessing = ref<boolean>(false);
const languageId = ref<string>("");

const upload = async () => {
  if (isProcessing.value) return;
  if (!languageId.value) {
    info("必须指定文件语言");
    return;
  }

  isProcessing.value = true;

  const { url, putSessionId } =
    await trpc.document.prepareCreateFromFile.mutate({
      meta: {
        name: props.file.name,
        size: props.file.size,
        mimeType: props.file.type,
      },
    });

  await uploadFileToS3PresignedURL(props.file, url);

  await trpc.document.finishCreateFromFile
    .mutate({
      projectId: props.projectId,
      languageId: languageId.value,
      putSessionId,
    })
    .then(() => {
      info(`上传 ${props.file.name} 成功，等待处理完成后即可翻译`);
    });
};
</script>

<template>
  <TableRow :key="file.name">
    <TableCell>{{ file.name }}</TableCell>
    <TableCell>{{ formatSize(file.size) }}</TableCell>
    <TableCell>
      <LanguagePicker v-model="languageId" />
    </TableCell>
    <TableCell>
      <div class="flex gap-2 items-center">
        <Button @click="upload" size="icon"
          ><div class="icon-[mdi--upload] size-4"
        /></Button>
      </div>
    </TableCell>
  </TableRow>
</template>
