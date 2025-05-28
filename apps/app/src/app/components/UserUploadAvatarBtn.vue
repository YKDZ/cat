<script setup lang="ts">
import Modal from "@/app/components/Modal.vue";
import ImageCopper from "@/app/components/ImageCopper.vue";
import { uploadFileToS3PresignedURL } from "@/app/utils/file";
import { FileMetaSchema } from "@cat/shared";
import { trpc } from "@/server/trpc/client";
import { usePageContext } from "vike-vue/usePageContext";
import { computed, ref, shallowRef } from "vue";
import Button from "./Button.vue";
import { useToastStore } from "../stores/toast";
import { useObjectUrl } from "@vueuse/core";

const ctx = usePageContext();

const { info, trpcWarn } = useToastStore();

const fileInputEl = ref<HTMLInputElement>();
const file = shallowRef();
const isOpen = ref(false);
const isProcessing = ref(false);

const src = useObjectUrl(file);

const onSubmit = async (blob: Blob | null) => {
  if (blob === null || !ctx.user) return;

  const file = new File([blob], `${ctx.user.id}.png`);

  const meta = FileMetaSchema.parse({
    name: file.name,
    type: rawFileMime.value,
    size: file.size,
  });

  await trpc.user.uploadAvatar
    .mutate({
      meta: meta,
    })
    .then(async (url) => {
      await uploadFileToS3PresignedURL(file, url)
        .then(() => {
          isOpen.value = false;
          info("成功上传头像");
        })
        .catch(trpcWarn)
        .finally(() => (isProcessing.value = false));
    })
    .catch(trpcWarn)
    .finally(() => (isProcessing.value = false));
};

const handleStart = () => {
  fileInputEl.value?.click();
};

const handleFileChange = () => {
  if (
    !fileInputEl.value ||
    !fileInputEl.value.files ||
    fileInputEl.value.files.length === 0
  )
    return;

  file.value = fileInputEl.value.files[0];
  isOpen.value = true;
};

const rawFileMime = computed(() => {
  if (!fileInputEl.value || !fileInputEl.value.files) return;
  const file = fileInputEl.value.files[0];
  return file.type;
});
</script>

<template>
  <Button icon="i-mdi:upload" :class="$attrs.class" @click="handleStart"
    >上传新头像</Button
  >
  <input
    ref="fileInputEl"
    type="file"
    class="hidden"
    accept="image/*"
    @change="handleFileChange"
  />
  <Modal :is-open="isOpen">
    <ImageCopper
      v-if="src"
      v-model:is-processing="isProcessing"
      :src
      :on-submit="onSubmit"
    />
  </Modal>
</template>
