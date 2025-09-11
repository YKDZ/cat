<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import MultiPicker from "./picker/MultiPicker.vue";
import type { Glossary } from "@cat/shared/schema/prisma/glossary";
import { trpc } from "@/server/trpc/client";
import type { PickerOption } from "./picker";
import { usePageContext } from "vike-vue/usePageContext";
import { useI18n } from "vue-i18n";

const { user } = usePageContext();

const props = withDefaults(
  defineProps<{
    width?: string;
    createNew?: boolean;
  }>(),
  {
    width: "fit-content",
    createNew: false,
  },
);

const { t } = useI18n();

const memoryIds = defineModel<string[]>("glossaryIds", { required: true });

const glossaries = ref<Glossary[]>([]);
const options = computed(() => {
  const result: PickerOption[] = [];

  if (props.createNew) {
    result.push({
      value: "createNew",
      content: t("创建一个同名术语库"),
    });
  }

  glossaries.value.forEach((glo) => {
    result.push({
      value: glo.id,
      content: glo.name,
    });
  });
  return result;
});

onMounted(() => {
  if (!user) return;

  trpc.glossary.listUserOwned
    .query({
      userId: user.id,
    })
    .then((glo) => {
      glossaries.value = glo;
    });
});
</script>

<template>
  <MultiPicker
    v-model="memoryIds"
    :options
    :width
    :placeholder="$t('选择一个或多个术语库')"
  />
</template>
