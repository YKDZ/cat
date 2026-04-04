<script setup lang="ts">
import { TableCell, TableRow } from "@cat/ui";
import { Button } from "@cat/ui";
import { ref } from "vue";

import LanguagePicker from "@/app/components/LanguagePicker.vue";
import { orpc } from "@/app/rpc/orpc";
import { useToastStore } from "@/app/stores/toast.ts";
import { formatSize, uploadFileToS3PresignedURL } from "@/app/utils/file.ts";

const { info } = useToastStore();

const props = defineProps<{
  projectId: string;
  file: File;
}>();

const isProcessing = ref<boolean>(false);
const languageId = ref<string>("en");

const upload = async () => {
  if (isProcessing.value) return;
  if (!languageId.value) {
    info("必须指定文件语言");
    return;
  }

  isProcessing.value = true;

  const { url, putSessionId } = await orpc.document.prepareCreateFromFile({
    meta: {
      name: props.file.name,
      size: props.file.size,
      mimeType: props.file.type,
    },
  });

  await uploadFileToS3PresignedURL(props.file, url);

  await orpc.document
    .finishCreateFromFile({
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
      <LanguagePicker v-model="languageId" :portal="false" />
    </TableCell>
    <TableCell>
      <div class="flex items-center gap-2">
        <Button @click="upload" size="icon"
          ><div class="icon-[mdi--upload] size-4"
        /></Button>
      </div>
    </TableCell>
  </TableRow>
</template>
