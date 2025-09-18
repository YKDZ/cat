<script setup lang="ts">
import { FileMetaSchema } from "@cat/shared/schema/misc";
import { usePageContext } from "vike-vue/usePageContext";
import { computed, ref, shallowRef } from "vue";
import { useObjectUrl } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import HButton from "./headless/HButton.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { trpc } from "@/server/trpc/client.ts";
import { uploadFileToS3PresignedURL } from "@/app/utils/file.ts";
import ImageCopper from "@/app/components/ImageCopper.vue";
import Modal from "@/app/components/headless/HModal.vue";

const { t } = useI18n();

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
    mimeType: rawFileMime.value,
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
  if (!file) return;
  return file.type;
});
</script>

<template>
  <HButton
    :classes="{
      base: 'btn btn-md btn-base',
    }"
    icon="i-mdi:upload"
    :class="$attrs.class"
    @click="handleStart"
    >{{ t("上传头像") }}</HButton
  >
  <input
    ref="fileInputEl"
    type="file"
    class="hidden"
    accept="image/*"
    @change="handleFileChange"
  />
  <Modal
    v-model="isOpen"
    :classes="{
      modal: 'modal',
      'modal-backdrop': 'modal-backdrop',
    }"
  >
    <ImageCopper
      v-if="src"
      v-model:is-processing="isProcessing"
      :src
      :on-submit="onSubmit"
    />
  </Modal>
</template>
