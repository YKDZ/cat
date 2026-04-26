<script setup lang="ts">
import type { ProjectSettingPayload } from "@cat/shared";

import { Label, Switch } from "@cat/ui";
import { nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import MultiLanguagePicker from "@/components/MultiLanguagePicker.vue";
import { orpc } from "@/rpc/orpc";
import { useToastStore } from "@/stores/toast.ts";

const props = defineProps<{
  projectId: string;
  pullRequestsEnabled: boolean;
}>();

const { t } = useI18n();
const { rpcWarn } = useToastStore();

const enableAutoTranslation = ref(false);
const autoTranslationLanguages = ref<string[]>([]);
const loading = ref(true);

const load = async () => {
  const result = await orpc.projectSettings
    .get({ projectId: props.projectId })
    .catch(rpcWarn);
  if (result) {
    enableAutoTranslation.value = result.enableAutoTranslation;
    autoTranslationLanguages.value = result.autoTranslationLanguages;
  }
  await nextTick();
  loading.value = false;
};

const updateSetting = async (patch: Partial<ProjectSettingPayload>) => {
  await orpc.projectSettings
    .update({ projectId: props.projectId, patch })
    .catch(rpcWarn);
};

watch(enableAutoTranslation, (val) => {
  if (!loading.value) updateSetting({ enableAutoTranslation: val });
});

watch(autoTranslationLanguages, (val) => {
  if (!loading.value) updateSetting({ autoTranslationLanguages: val });
});

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-base font-semibold">{{ t("自动翻译") }}</h2>
    <p class="text-sm text-muted-foreground">
      {{ t("配置自动翻译和 Ghost Text 建议。") }}
    </p>

    <div v-if="!pullRequestsEnabled" class="text-sm text-muted-foreground">
      {{
        t(
          "需要先启用 Pull Request 功能才能使用自动翻译。请在项目功能设置中开启。",
        )
      }}
    </div>

    <template v-else>
      <div class="flex items-center space-x-2">
        <Switch
          v-model="enableAutoTranslation"
          id="enableAutoTranslation"
          :disabled="loading"
        />
        <Label for="enableAutoTranslation">{{ t("启用自动翻译") }}</Label>
      </div>

      <template v-if="enableAutoTranslation">
        <div class="space-y-2">
          <Label>{{ t("自动翻译语言") }}</Label>
          <p class="text-sm text-muted-foreground">
            {{ t("选择需要自动翻译的目标语言。留空则对所有目标语言生效。") }}
          </p>
          <MultiLanguagePicker v-model="autoTranslationLanguages" />
        </div>
      </template>
    </template>
  </div>
</template>
