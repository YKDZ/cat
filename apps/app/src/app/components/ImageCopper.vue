<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import RangeInput from "./RangeInput.vue";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/app/components/ui/spinner";

const { t } = useI18n();

const props = defineProps<{
  src: string;
  onSubmit: (blob: Blob | null) => void;
}>();

const isProcessing = defineModel<boolean>("isProcessing", {
  required: false,
  default: false,
});

const copperWidth = ref(288);
const copperHeight = ref(288);
const minScale = ref(0);
const maxScale = ref(100);
const minExportWidth = ref(256);
const minExportHeight = ref(256);
const bgCanvasEl = ref<HTMLCanvasElement>();
const imgCanvasEl = ref<HTMLCanvasElement>();
const copperCanvasEl = ref<HTMLCanvasElement>();
const exportCanvasEl = ref<HTMLCanvasElement>();
const image = ref<InstanceType<typeof Image>>();
const scale = ref(0);
const imgNaturalWidth = ref(0);
const imgNaturalHeight = ref(0);
const imageX = ref(0);
const imageY = ref(0);
const isGrabbing = ref(false);
const grabStartX = ref(0);
const grabStartY = ref(0);

const coppedRegion = computed(() => {
  return {
    x: -imageX.value / scale.value,
    y: -imageY.value / scale.value,
    width: copperWidth.value / scale.value,
    height: copperHeight.value / scale.value,
  };
});

const startGrabbing = (e: MouseEvent) => {
  if (!image.value) return;

  const mouseX = e.offsetX;
  const mouseY = e.offsetY;

  if (
    mouseX >= imageX.value &&
    mouseX <= imageX.value + imgNaturalWidth.value * scale.value &&
    mouseY >= imageY.value &&
    mouseY <= imageY.value + imgNaturalHeight.value * scale.value
  ) {
    isGrabbing.value = true;
    grabStartX.value = mouseX - imageX.value;
    grabStartY.value = mouseY - imageY.value;
  }
};

const handleGrabbing = (e: MouseEvent) => {
  if (isGrabbing.value) {
    imageX.value = e.offsetX - grabStartX.value;
    imageY.value = e.offsetY - grabStartY.value;
  }
};

const stopGrabbing = () => {
  isGrabbing.value = false;
};

const drawCheckerboard = () => {
  if (!bgCanvasEl.value) return;
  const ctx = bgCanvasEl.value.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, copperWidth.value, copperHeight.value);

  const tileSize = 16;
  const cols = Math.ceil(copperWidth.value / tileSize);
  const rows = Math.ceil(copperHeight.value / tileSize);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const isGray = (row + col) % 2 === 0;
      ctx.fillStyle = isGray ? "#DDD" : "#FFF";
      ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
    }
  }
};

const drawImage = () => {
  if (!imgCanvasEl.value || !image.value) return;
  const ctx = imgCanvasEl.value.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, imgCanvasEl.value.width, imgCanvasEl.value.height);
  ctx.drawImage(
    image.value,
    0,
    0,
    imgNaturalWidth.value,
    imgNaturalHeight.value,
    imageX.value,
    imageY.value,
    imgNaturalWidth.value * scale.value,
    imgNaturalHeight.value * scale.value,
  );
};

const drawExport = () => {
  if (!exportCanvasEl.value || !image.value) return;
  const ctx = exportCanvasEl.value.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, exportCanvasEl.value.width, exportCanvasEl.value.height);
  ctx.fillStyle = "rgba(0, 0, 0, 0)";
  ctx.drawImage(
    image.value,
    coppedRegion.value.x,
    coppedRegion.value.y,
    coppedRegion.value.width,
    coppedRegion.value.height,
    0,
    0,
    coppedRegion.value.width,
    coppedRegion.value.height,
  );
};

const drawCopper = () => {
  if (!copperCanvasEl.value) return;
  const ctx = copperCanvasEl.value.getContext("2d");

  if (!ctx) return;

  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.beginPath();
  ctx.rect(0, 0, copperWidth.value, copperHeight.value);
  ctx.arc(
    copperWidth.value / 2,
    copperHeight.value / 2,
    Math.min(copperWidth.value, copperHeight.value) / 2,
    0,
    Math.PI * 2,
  );
  ctx.fill("evenodd");
  ctx.restore();
};

const handleSubmit = () => {
  if (!exportCanvasEl.value) return;

  isProcessing.value = true;

  drawExport();
  exportCanvasEl.value.toBlob(props.onSubmit, "image/png", 1);
};

const handleImgLoad = () => {
  if (!image.value || !imgCanvasEl.value) return;

  imgNaturalWidth.value = image.value.naturalWidth;
  imgNaturalHeight.value = image.value.naturalHeight;

  // 最大缩放
  maxScale.value = Math.min(
    copperWidth.value / minExportWidth.value,
    copperHeight.value / minExportHeight.value,
  );

  // 初始缩放
  if (imgNaturalWidth.value <= imgNaturalHeight.value) {
    scale.value = Math.min(
      maxScale.value,
      Math.max(minScale.value, copperWidth.value / imgNaturalWidth.value),
    );
  } else {
    scale.value = Math.min(
      maxScale.value,
      Math.max(minScale.value, copperHeight.value / imgNaturalHeight.value),
    );
  }
};

watch(scale, drawImage);
watch(imageX, drawImage);
watch(imageY, drawImage);

onMounted(() => {
  drawCheckerboard();
  drawCopper();
  image.value = new Image();
  image.value.src = props.src;
  image.value.onload = handleImgLoad;
});
</script>

<template>
  <div
    class="px-8 py-8 rounded-lg bg-background flex flex-col gap-4 items-center justify-center"
  >
    <div
      class="relative"
      :style="{
        width: copperWidth + 'px',
        height: copperHeight + 'px',
      }"
    >
      <canvas
        ref="bgCanvasEl"
        class="rounded-md inset-0 absolute"
        :width="copperWidth"
        :height="copperHeight"
      />

      <!-- 图片层（添加绝对定位） -->
      <canvas
        ref="imgCanvasEl"
        class="rounded-md inset-0 absolute"
        :width="copperWidth"
        :height="copperHeight"
        :class="{
          'cursor-grab': !isGrabbing,
          'cursor-grabbing': isGrabbing,
        }"
        @mousedown="startGrabbing"
        @mousemove="handleGrabbing"
        @mouseup="stopGrabbing"
        @mouseleave="stopGrabbing"
      />

      <!-- 覆盖层（裁剪蒙版） -->
      <canvas
        ref="copperCanvasEl"
        class="pointer-events-none inset-0 absolute"
        :width="copperWidth"
        :height="copperHeight"
      />

      <canvas
        ref="exportCanvasEl"
        class="hidden"
        :width="coppedRegion.width"
        :height="coppedRegion.height"
      />
    </div>
    <RangeInput
      v-model="scale"
      :min="minScale"
      :max="maxScale"
      step="any"
      class="w-5/6"
    />
    <Button @click="handleSubmit"
      ><Spinner v-if="isProcessing" /> {{ t("裁剪") }}</Button
    >
  </div>
</template>
