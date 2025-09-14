<script setup lang="ts">
import type { Document } from "@cat/shared/schema/prisma/document";
import type { Project } from "@cat/shared/schema/prisma/project";
import { computed, ref, shallowRef } from "vue";
import { TRPCClientError } from "@trpc/client";
import { useI18n } from "vue-i18n";
import Icon from "./Icon.vue";
import HButton from "./headless/HButton.vue";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import TableCell from "@/app/components/table/TableCell.vue";
import TableRow from "@/app/components/table/TableRow.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { formatSize, uploadFileToS3PresignedURL } from "@/app/utils/file.ts";
import { trpc } from "@/server/trpc/client.ts";

const { t } = useI18n();

const { info, warn, trpcWarn } = useToastStore();

const fileInputEl = ref<HTMLInputElement>();

const project = defineModel<Project>("project", { required: true });

const isProcessing = ref<boolean>(false);

const acceptedExt = ref<string[]>(["yml", "yaml", "md", "json"]);

const acceptAttr = computed(() =>
  acceptedExt.value.map((ext) => "." + ext).join(", "),
);

type TempFile = {
  tempId: string;
  status: "pending" | "failed" | "processing" | "completed";
  raw: File;
  document?: Document;
};

const files = shallowRef<TempFile[]>([]);

const selectFile = () => {
  if (!fileInputEl.value || !fileInputEl.value.files) return;

  const newFiles: TempFile[] = Array.from(fileInputEl.value.files)
    .filter((file) =>
      acceptedExt.value.includes(file.name.split(".").pop() ?? ""),
    )
    .map((file) => {
      return {
        tempId: Math.random().toString(36),
        status: "pending",
        raw: file,
      };
    });

  files.value = [...files.value, ...newFiles];
  fileInputEl.value.value = "";
};

const removeFile = async (file: TempFile) => {
  if (file.status === "pending") {
    files.value = files.value.filter((file) => file.tempId !== file.tempId);
  } else if (file.status === "completed") {
    if (!file.document) return;

    await trpc.document.delete
      .mutate({ id: file.document.id })
      .then(() => {
        project.value.Documents = project.value.Documents?.filter(
          (document) => document.id !== file.document?.id,
        );

        files.value = files.value.filter((file) => file.tempId !== file.tempId);
      })
      .catch(trpcWarn);
  }
};

const uploadAll = async () => {
  for (const file of files.value) {
    if (!(file.status !== "completed" && file.status !== "processing")) return;
    await upload(file);
  }
};

const upload = async (tempFile: TempFile) => {
  if (isProcessing.value) return;
  if (tempFile.status === "completed") {
    warn("文件无需被再次上传");
    return;
  }
  if (tempFile.status === "processing") {
    warn("文件正在被上传中，请稍后");
    return;
  }

  isProcessing.value = true;
  tempFile.status = "processing";

  if (!project.value) return;

  try {
    const { url, file } = await trpc.document.fileUploadURL.mutate({
      meta: {
        name: tempFile.raw.name,
        size: tempFile.raw.size,
        mimeType: tempFile.raw.type,
      },
    });

    await uploadFileToS3PresignedURL(tempFile.raw, url);

    await trpc.document.createFromFile
      .mutate({
        projectId: project.value.id,
        fileId: file.id,
      })
      .then((document) => {
        project.value.Documents?.push(document);
        tempFile.status = "completed";
        info(`上传 ${tempFile.raw.name} 成功，等待处理完成后即可翻译`);
      });
  } catch (e) {
    if (e instanceof TRPCClientError) trpcWarn(e);
    tempFile.status = "failed";
  }
};
</script>

<template>
  <!-- Upload File -->
  <div v-if="project" class="flex flex-col gap-2 min-w-screen-lg">
    <p class="text-lg flex items-center">
      <span class="i-mdi:file-upload mr-1 inline-block" />
      为项目
      <span class="font-bold mx-1">{{ project.name }}</span> 上传需要翻译的文件
    </p>
    <input
      ref="fileInputEl"
      type="file"
      multiple
      :accept="acceptAttr"
      class="hidden"
      @change="selectFile"
    />
    <Table class="md:max-w-3/4">
      <TableBody>
        <TableRow v-for="file in files" :key="file.tempId">
          <TableCell>{{ file.raw.name }}</TableCell>
          <TableCell>{{ formatSize(file.raw.size) }}</TableCell>
          <TableCell>
            <Icon
              v-if="file.status === 'pending'"
              icon="i-mdi:dots-horizontal"
            /><Icon
              v-else-if="file.status === 'processing'"
              icon="i-mdi:loading"
              class="animate-spin"
            /><Icon
              v-else-if="file.status === 'completed'"
              icon="i-mdi:check-circle-outline"
              class="color-base"
            /><Icon
              v-else-if="file.status === 'failed'"
              icon="i-mdi:close-circle-outline"
              class="color-red"
            />
          </TableCell>
          <TableCell>
            <div class="flex gap-2 items-center">
              <HButton
                :classes="{
                  base: 'btn btn-md btn-base btn-square',
                  icon: 'btn-icon btn-icon-md',
                }"
                :disabled="
                  file.status !== `completed` && file.status !== `pending`
                "
                icon="i-mdi:trash-can"
                @click="removeFile(file)"
              /><HButton
                :disabled="
                  file.status === `completed` || file.status === `processing`
                "
                :classes="{
                  base: 'btn btn-md btn-base btn-square',
                  icon: 'btn-icon btn-icon-md',
                }"
                icon="i-mdi:upload"
                @click="upload(file)"
              />
            </div>
          </TableCell>
        </TableRow>
        <TableRow v-if="files.length === 0">
          <TableCell></TableCell>
          <TableCell class="text-center">{{
            t("还没有上传任何文件...")
          }}</TableCell>
          <TableCell></TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <div class="flex gap-4 items-center">
      <HButton
        :classes="{
          base: 'btn btn-md btn-base',
        }"
        icon="i-mdi:folder"
        :is-processing
        @click="fileInputEl && fileInputEl.click()"
      >
        {{ t("选择文件") }}
      </HButton>
      <HButton
        :classes="{
          base: 'btn btn-md btn-base',
        }"
        icon="i-mdi:upload-multiple"
        :loading="isProcessing"
        @click="uploadAll"
      >
        {{ t("上传所有") }}
      </HButton>
    </div>
  </div>
</template>
