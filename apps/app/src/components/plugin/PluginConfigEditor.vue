<script setup lang="ts">
import { type NonNullJSONType, nonNullSafeZDotJson } from "@cat/shared";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@cat/ui";
import { Save, TestTube2 } from "@lucide/vue";
import { computed, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import * as z from "zod";

import JsonForm from "@/components/json-form/JsonForm.vue";

import type { NonNullPluginDetail } from "./types";

const { t } = useI18n();

/**
 * @zh 插件配置编辑器的属性。
 * @en Props for the plugin configuration editor.
 */
const props = defineProps<{
  /** @zh 插件详情读模型。 @en Plugin detail read model. */
  detail: NonNullPluginDetail;
  /** @zh 保存请求是否进行中。 @en Whether a save request is in progress. */
  isSaving: boolean;
  /** @zh 检测请求是否进行中。 @en Whether a probe request is in progress. */
  isProbing: boolean;
}>();

/**
 * @zh 插件配置编辑器触发的事件。
 * @en Events emitted by the plugin configuration editor.
 */
const emit = defineEmits<{
  /** @zh 保存当前编辑配置并请求后端热应用。 @en Save the edited config and request backend hot-apply. */
  save: [value: NonNullJSONType, expectedUpdatedAt: string | null];
  /** @zh 使用当前表单值发起候选配置检测。 @en Probe the current form value as candidate config. */
  probeCandidate: [value: NonNullJSONType];
}>();

const cloneJson = (value: NonNullJSONType): NonNullJSONType => {
  return nonNullSafeZDotJson.parse(JSON.parse(JSON.stringify(value)));
};

const savedData = shallowRef<NonNullJSONType>(props.detail.config.value);
const localData = shallowRef<NonNullJSONType>(
  cloneJson(props.detail.config.value),
);
const errors = ref<string[]>([]);

const isDirty = computed(() => {
  return JSON.stringify(localData.value) !== JSON.stringify(savedData.value);
});

watch(
  () => props.detail.config.value,
  (value) => {
    const hadLocalChanges = isDirty.value;
    savedData.value = value;
    if (!hadLocalChanges) {
      localData.value = cloneJson(value);
    }
    errors.value = [];
  },
);

const zodSchema = computed(() => {
  if (!props.detail.config.schema) return null;
  try {
    return z.fromJSONSchema(props.detail.config.schema);
  } catch {
    return null;
  }
});

const validate = (): boolean => {
  if (!zodSchema.value) return true;
  const result = zodSchema.value.safeParse(localData.value);
  if (result.success) {
    errors.value = [];
    return true;
  }
  errors.value = result.error.issues.map((issue) => issue.message);
  return false;
};

const handleUpdate = (value: NonNullJSONType) => {
  localData.value = value;
};

const handleSave = () => {
  if (!validate()) return;
  emit("save", localData.value, props.detail.config.expectedUpdatedAt);
};

const handleProbeCandidate = () => {
  if (!validate()) return;
  emit("probeCandidate", localData.value);
};
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ t("配置") }}</CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <div
        v-if="!detail.config.hasConfig"
        class="rounded-md border border-dashed p-4 text-sm text-muted-foreground"
      >
        {{ t("此插件没有配置项") }}
      </div>

      <template v-else>
        <JsonForm
          v-if="
            detail.config.schema && typeof detail.config.schema !== 'boolean'
          "
          :data="localData"
          :schema="detail.config.schema"
          @update="handleUpdate"
        />
        <div
          v-else
          class="rounded-md border border-dashed p-4 text-sm text-muted-foreground"
        >
          {{ t("此插件没有配置项") }}
        </div>

        <div
          v-if="errors.length > 0"
          class="space-y-1 text-sm text-destructive"
        >
          <p v-for="(error, index) in errors" :key="index">{{ error }}</p>
        </div>

        <div class="flex flex-wrap gap-2">
          <Button
            :disabled="!isDirty || isSaving || !detail.actions.canSaveConfig"
            @click="handleSave"
          >
            <Save class="mr-2 size-4" />
            {{ isSaving ? t("保存并应用中…") : t("保存并应用") }}
          </Button>
          <Button
            variant="outline"
            :disabled="isProbing || !detail.actions.canProbeCandidate"
            @click="handleProbeCandidate"
          >
            <TestTube2 class="mr-2 size-4" />
            {{ isProbing ? t("检测中…") : t("检测当前配置") }}
          </Button>
          <p v-if="isDirty" class="self-center text-xs text-muted-foreground">
            {{ t("当前表单有未保存修改") }}
          </p>
        </div>
      </template>
    </CardContent>
  </Card>
</template>
