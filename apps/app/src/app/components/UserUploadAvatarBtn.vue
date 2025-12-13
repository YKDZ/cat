<script setup lang="ts">
import { FileMetaSchema } from "@cat/shared/schema/misc";
import { usePageContext } from "vike-vue/usePageContext";
import { computed, ref, shallowRef } from "vue";
import { useObjectUrl } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { useToastStore } from "@/app/stores/toast.ts";
import { trpc } from "@cat/app-api/trpc/client";
import { uploadFileToS3PresignedURL } from "@/app/utils/file.ts";
import ImageCopper from "@/app/components/ImageCopper.vue";
import Button from "@/app/components/ui/button/Button.vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import DialogTrigger from "@/app/components/ui/dialog/DialogTrigger.vue";

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

  await trpc.user.prepareUploadAvatar
    .mutate({
      meta: meta,
    })
    .then(async ({ url, putSessionId }) => {
      await uploadFileToS3PresignedURL(file, url)
        .then(() => {
          isOpen.value = false;
          info("成功上传头像");
        })
        .catch(trpcWarn)
        .finally(() => (isProcessing.value = false));

      await trpc.user.finishUploadAvatar.mutate({ putSessionId });
    })
    .catch(trpcWarn)
    .finally(() => (isProcessing.value = false));
};

const handleFileChange = () => {
  if (
    !fileInputEl.value ||
    !fileInputEl.value.files ||
    fileInputEl.value.files.length === 0
  )
    return;

  file.value = fileInputEl.value.files[0];
  if (!file.value) return;
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
  <input
    ref="fileInputEl"
    type="file"
    class="hidden"
    accept="image/*"
    @change="handleFileChange"
  />
  <Dialog v-model:open="isOpen">
    <DialogTrigger as-child>
      <Button :class="$attrs.class" @click="fileInputEl!.click()"
        ><div class="icon-[mdi--upload] size-4" />
        {{ t("上传头像") }}</Button
      >
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {{ t("裁减头像") }}
        </DialogTitle>
        <DialogDescription>
          {{ t("拖动滑块调整裁剪框尺寸，拖动图片修改中心位置") }}
        </DialogDescription>
      </DialogHeader>
      <div class="w-full flex flex-col gap-4 justify-center items-center">
        <ImageCopper
          v-if="src"
          v-model:is-processing="isProcessing"
          :src="src"
          :on-submit="onSubmit"
        />
      </div>
    </DialogContent>
  </Dialog>
</template>
