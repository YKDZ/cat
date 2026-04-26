<script setup lang="ts">
import { Label, Switch } from "@cat/ui";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/rpc/orpc";
import { useToastStore } from "@/stores/toast.ts";

const props = defineProps<{
  projectId: string;
  features: { issues: boolean; pullRequests: boolean };
}>();

const emit = defineEmits<{
  "update:features": [features: { issues: boolean; pullRequests: boolean }];
}>();

const { t } = useI18n();
const { rpcWarn } = useToastStore();

const issues = ref(props.features.issues);
const pullRequests = ref(props.features.pullRequests);
const saving = ref(false);

const updateFeatures = async (newFeatures: {
  issues: boolean;
  pullRequests: boolean;
}) => {
  saving.value = true;
  const result = await orpc.projectFeatures
    .updateFeatures({
      projectId: props.projectId,
      features: newFeatures,
    })
    .catch(rpcWarn);
  saving.value = false;
  if (result) {
    emit("update:features", result.features);
  }
};

watch(issues, (val) => {
  updateFeatures({ issues: val, pullRequests: pullRequests.value });
});

watch(pullRequests, (val) => {
  updateFeatures({ issues: issues.value, pullRequests: val });
});
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-base font-semibold">{{ t("项目功能") }}</h2>
    <p class="text-sm text-muted-foreground">
      {{ t("启用或关闭项目的可选功能模块。") }}
    </p>

    <div class="flex items-center space-x-2">
      <Switch v-model="issues" id="featureIssues" :disabled="saving" />
      <Label for="featureIssues">{{ t("议题") }}</Label>
    </div>

    <div class="flex items-center space-x-2">
      <Switch
        v-model="pullRequests"
        id="featurePullRequests"
        :disabled="saving"
      />
      <Label for="featurePullRequests">{{ t("拉取请求") }}</Label>
    </div>
  </div>
</template>
