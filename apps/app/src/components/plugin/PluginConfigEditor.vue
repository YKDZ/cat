<script setup lang="ts">
import { type NonNullJSONType, nonNullSafeZDotJson } from "@cat/shared";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@cat/ui";
import { Save, TestTube2 } from "@lucide/vue";
import { computed, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import * as z from "zod";

import JsonForm from "#/components/json-form/JsonForm.vue";

import type { NonNullPluginDetail, PluginProbeTarget } from "./types.ts";

const { t } = useI18n();

/**
 * Props for the plugin configuration editor.
 */
const props = defineProps<{
  /** Plugin detail read model. */
  detail: NonNullPluginDetail;
  /** Whether a save request is in progress. */
  isSaving: boolean;
  /** Target currently being probed, if any. */
  activeProbeTarget: PluginProbeTarget | null;
}>();

/**
 * Events emitted by the plugin configuration editor.
 */
const emit = defineEmits<{
  /** Save the edited config and request backend hot-apply. */
  save: [value: NonNullJSONType, expectedRevision: number | null];
  /** Explicitly migrate the stale config and request backend hot-apply. */
  migrate: [value: NonNullJSONType];
  /** Probe the current form value as candidate config. */
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
const isCandidateProbing = computed(
  () => props.activeProbeTarget === "CANDIDATE",
);
const isProbeInProgress = computed(() => props.activeProbeTarget !== null);

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
  emit("save", localData.value, props.detail.config.expectedRevision);
};

const handleProbeCandidate = () => {
  if (!validate()) return;
  emit("probeCandidate", localData.value);
};

const handleMigrate = () => {
  if (!validate()) return;
  emit("migrate", localData.value);
};
</script>

<template>
  <Card data-testid="plugin-config-editor">
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
        <div
          v-if="detail.config.isStale"
          class="border-warning text-warning rounded-md border p-3 text-sm"
        >
          {{ t("此配置使用旧 schema，必须显式迁移后才能激活") }}
        </div>
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
            v-if="detail.config.isStale"
            :disabled="isSaving || !detail.actions.canMigrateConfig"
            @click="handleMigrate"
          >
            <Save class="mr-2 size-4" />
            {{ isSaving ? t("迁移并应用中…") : t("迁移并应用") }}
          </Button>
          <Button
            :disabled="!isDirty || isSaving || !detail.actions.canSaveConfig"
            @click="handleSave"
          >
            <Save class="mr-2 size-4" />
            {{ isSaving ? t("保存并应用中…") : t("保存并应用") }}
          </Button>
          <Button
            variant="outline"
            :disabled="isProbeInProgress || !detail.actions.canProbeCandidate"
            @click="handleProbeCandidate"
          >
            <TestTube2 class="mr-2 size-4" />
            {{ isCandidateProbing ? t("检测中…") : t("检测当前配置") }}
          </Button>
          <p v-if="isDirty" class="self-center text-xs text-muted-foreground">
            {{ t("当前表单有未保存修改") }}
          </p>
        </div>
      </template>
    </CardContent>
  </Card>
</template>
