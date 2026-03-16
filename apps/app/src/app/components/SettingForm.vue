<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import * as z from "zod/v4";
import { useI18n } from "vue-i18n";
import type { JSONSchema, NonNullJSONType } from "@cat/shared/schema/json";
import JsonForm from "@/app/components/json-form/JsonForm.vue";
import { Button } from "@cat/ui";
import { Save } from "lucide-vue-next";

const { t } = useI18n();

const props = defineProps<{
  configGetter: () => Promise<NonNullJSONType>;
  configSetter: (value: NonNullJSONType) => Promise<void>;
  schema: JSONSchema;
  onSaved?: () => Promise<void>;
}>();

const savedData = shallowRef<NonNullJSONType>({});
const localData = shallowRef<NonNullJSONType>({});
const isPending = ref(false);
const errors = ref<string[]>([]);

const isDirty = computed(() => {
  return JSON.stringify(localData.value) !== JSON.stringify(savedData.value);
});

const zodSchema = computed(() => {
  try {
    return z.fromJSONSchema(props.schema);
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
  errors.value = result.error.issues.map((i) => i.message);
  return false;
};

const handleUpdate = (value: NonNullJSONType) => {
  localData.value = value;
};

const handleSave = async () => {
  if (!validate()) return;

  isPending.value = true;
  try {
    await props.configSetter(localData.value);
    savedData.value = JSON.parse(JSON.stringify(localData.value));
    errors.value = [];
    if (props.onSaved) {
      await props.onSaved();
    }
  } finally {
    isPending.value = false;
  }
};

onMounted(async () => {
  const data = await props.configGetter();
  savedData.value = data;
  localData.value = JSON.parse(JSON.stringify(data));
});
</script>

<template>
  <div class="space-y-4">
    <JsonForm
      v-if="typeof schema !== 'boolean'"
      :data="localData"
      :schema
      @update="handleUpdate"
    />
    <span v-else class="text-sm text-muted-foreground">{{
      t("此插件没有配置项")
    }}</span>

    <div v-if="errors.length > 0" class="space-y-1 text-sm text-destructive">
      <p v-for="(error, i) in errors" :key="i">{{ error }}</p>
    </div>

    <Button :disabled="!isDirty || isPending" @click="handleSave">
      <Save class="mr-2 size-4" />
      {{ t("保存") }}
    </Button>
  </div>
</template>
