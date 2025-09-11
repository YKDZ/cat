<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import { computed, inject, onMounted, ref } from "vue";
import { languageKey } from "../utils/provide";
import type { TranslationAdvisorData } from "@cat/shared/schema/misc";
import { toShortFixed } from "@cat/shared/utils";
import { type Document } from "@cat/shared/schema/prisma/document";
import Modal from "./Modal.vue";
import { useToastStore } from "../stores/toast";
import InputLabel from "./InputLabel.vue";
import RangeInput from "./RangeInput.vue";
import type { PickerOption } from "./picker";
import Picker from "./picker/Picker.vue";
import { useI18n } from "vue-i18n";
import HButton from "./headless/HButton.vue";

const props = defineProps<{
  document: Document;
}>();

const { info, warn, trpcWarn } = useToastStore();
const { t } = useI18n();

const language = inject(languageKey);
const isOpen = ref(false);
const minMemorySimilarity = ref(0.72);
const availableAdvisors = ref<TranslationAdvisorData[]>([]);
const advisorId = ref<string | null>(null);

const advisorOptions = computed<PickerOption[]>(() => {
  return availableAdvisors.value.map(
    (advisor) =>
      ({
        value: advisor.id,
        content: advisor.name,
      }) satisfies PickerOption,
  );
});

const handleAutoTranslate = async () => {
  if (!language || !language.value) return;
  if (!advisorId.value) {
    warn(t("必须选择一个可用的翻译建议器"));
    return;
  }

  await trpc.translation.autoTranslate
    .mutate({
      languageId: language.value.id,
      documentId: props.document.id,
      advisorId: advisorId.value,
      minMemorySimilarity: minMemorySimilarity.value,
    })
    .then(() => {
      isOpen.value = false;
      info(t("成功创建自动翻译任务"));
    })
    .catch(trpcWarn);
};

const updateAvailableAdvisor = async () => {
  await trpc.suggestion.listAllAvailableAdvisors
    .query()
    .then((advisors) => (availableAdvisors.value = advisors));

  if (availableAdvisors.value.length > 0 && !advisorId.value) {
    advisorId.value = availableAdvisors.value[0].id;
  }
};

onMounted(updateAvailableAdvisor);
</script>

<template>
  <HButton
    n
    :classes="{
      base: 'btn btn-md btn-base btn-square',
    }"
    icon="i-mdi:translate"
    @click.stop="isOpen = true"
  />
  <Modal v-model:is-open="isOpen">
    <div
      class="text-highlight-content p-10 pt-0 rounded-md bg-highlight flex flex-col gap-2"
    >
      <article class="prose-highlight-content max-w-460px prose">
        <h3 class="text-highlight-content-darker">{{ t("自动翻译") }}</h3>
        <p>
          {{
            t(
              "这将用你选中的翻译建议器以及项目绑定的术语库和记忆库自动为文档中还没有任何翻译的元素填充一条翻译。",
            )
          }}
        </p>
        <p>
          {{ t("若不选择任何建议器，则只会应用翻译记忆。") }}
        </p>
        <p>
          {{
            t(
              "自动翻译不会生成翻译记忆，且翻译出的条目带有“来自自动翻译”元数据，在工作台等位置具有特殊的颜色标记。",
            )
          }}
        </p>
      </article>
      <form class="flex flex-col gap-1 w-full">
        <div class="flex flex-col gap-1">
          <InputLabel>{{
            t("记忆最低匹配度：{similarity}%", {
              similarity: toShortFixed(minMemorySimilarity * 100),
            })
          }}</InputLabel>
          <RangeInput
            v-model="minMemorySimilarity"
            :min="0"
            :max="1"
            step="0.005"
          />
        </div>
        <div class="flex flex-col gap-2">
          <InputLabel>{{ t("使用的翻译建议器") }}</InputLabel>
          <Picker v-model="advisorId" :options="advisorOptions" />
        </div>
      </form>
      <HButton
        :classes="{
          base: 'btn btn-md btn-base btn-w-full',
        }"
        @click="handleAutoTranslate"
        >{{ t("确认") }}</HButton
      >
    </div>
  </Modal>
</template>
