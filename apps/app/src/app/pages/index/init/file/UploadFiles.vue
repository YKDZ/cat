<script setup lang="ts">
import Button from "@/app/components/Button.vue";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import TableCell from "@/app/components/table/TableCell.vue";
import TableHead from "@/app/components/table/TableHead.vue";
import TableHeader from "@/app/components/table/TableHeader.vue";
import TableRow from "@/app/components/table/TableRow.vue";
import { useLanguageStore } from "@/app/stores/language";
import { useToastStore } from "@/app/stores/toast";
import { fileToBase64, formatSize } from "@/app/utils/file";
import { trpc } from "@/server/trpc/client";
import { Project } from "@cat/shared";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";

const { info, warn, zWarn, error } = useToastStore();

const { languages } = storeToRefs(useLanguageStore());

const fileInputEl = ref<HTMLInputElement>();

const progress = defineModel("progress", { type: Number, required: true });
const project = defineModel<Project>("project");

const isProcessing = ref<boolean>(false);

const acceptedExt = ref<string[]>(["yml", "yaml", "md", "json"]);

const acceptAttr = computed(() =>
  acceptedExt.value.map((ext) => "." + ext).join(", "),
);

type TempFile = {
  tempId: string;
  status: "waiting" | "failed" | "pending" | "success";
  raw: File;
};

const files = ref<TempFile[]>([]);

const selectFile = () => {
  if (!fileInputEl.value || !fileInputEl.value.files) return;

  Array.from(fileInputEl.value.files).forEach((file) => console.log(file.type));

  const newFiles: TempFile[] = Array.from(fileInputEl.value.files)
    .filter((file) =>
      acceptedExt.value.includes(file.name.split(".").pop() ?? ""),
    )
    .map((file) => {
      return {
        tempId: Math.random().toString(36),
        status: "waiting",
        raw: file,
      };
    });

  files.value = [...files.value, ...newFiles];
  fileInputEl.value.value = "";
};

const removeFile = (id: string) => {
  files.value = files.value.filter((file) => id !== file.tempId);
};

const uploadAll = async () => {
  files.value
    .filter((file) => file.status !== "success" && file.status !== "pending")
    .forEach(async (file) => {
      await upload(file);
    });
};

const upload = async (file: TempFile) => {
  if (isProcessing.value) return;
  if (file.status === "success") {
    warn("文件无需被再次上传");
    return;
  }
  if (file.status === "pending") {
    warn("文件正在被上传中，请稍后");
    return;
  }

  isProcessing.value = true;
  file.status = "pending";

  fileToBase64(file.raw)
    .then(async (base64File) => {
      if (!project.value) return;
      await trpc.document.create
        .mutate({
          projectId: project.value.id,
          base64File,
          name: file.raw.name,
          type: file.raw.type,
        })
        .then(() => (file.status = "success"));
    })
    .finally(() => {
      file.status = "failed";
      isProcessing.value = false;
    });
};
</script>

<template>
  <!-- Upload File -->
  <div v-if="project" class="flex flex-col gap-2">
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
      <TableHeader>
        <TableHead>文件名</TableHead>
        <TableHead>大小</TableHead>
        <TableHead>状态</TableHead>
        <TableHead>操作</TableHead>
      </TableHeader>
      <TableBody>
        <TableRow v-for="file in files" :key="file.tempId">
          <TableCell>{{ file.raw.name }}</TableCell>
          <TableCell>{{ formatSize(file.raw.size) }}</TableCell>
          <TableCell>{{ file.status }}</TableCell>
          <TableCell>
            <div class="flex gap-2 items-center">
              <Button
                no-text
                icon="i-mdi:trash-can"
                @click="removeFile(file.tempId)"
              /><Button
                :disabled="
                  file.status === `success` || file.status === `pending`
                "
                no-text
                icon="i-mdi:upload"
                @click="upload(file)"
              /></div
          ></TableCell>
        </TableRow>
        <TableRow v-if="files.length === 0">
          <TableCell></TableCell>
          <TableCell class="text-center">还没有上传任何文件...</TableCell>
          <TableCell></TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <div class="flex gap-4 items-center">
      <Button
        icon="i-mdi:folder"
        :is-processing
        @click="fileInputEl && fileInputEl.click()"
        >选择文件</Button
      >
      <Button icon="i-mdi:upload-multiple" :is-processing @click="uploadAll"
        >上传所有</Button
      >
      <Button
        icon="i-mdi:clock"
        class="justify-self-stretch"
        :is-processing
        @click="progress += 1"
        >先不上传文件</Button
      >
    </div>
  </div>
</template>
