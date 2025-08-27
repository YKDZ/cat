<script setup lang="ts">
import { onBeforeMount, shallowReactive, shallowRef } from "vue";
import type { JSONType } from "@cat/shared";
import JSONForm from "./json-form/JSONForm.vue";
import Button from "./Button.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{
  configGetter: (key: string) => Promise<JSONType>;
  configSetter: (updated: Map<string, JSONType>) => Promise<void>;
  schema: z.infer<typeof z.json>;
}>();

const data = shallowRef<JSONType>({});

const updated = shallowReactive(new Map<string, JSONType>());

const handleSave = () => {
  props.configSetter(updated);
};

const handleUpdate = (value: JSONType, key?: string) => {
  if (!key) return;
  updated.set(key, (value as Record<string, JSONType>)[key]);
};

// 不处理递归
const dataFromSchema = async (
  schema: z.infer<typeof z.json>,
): Promise<JSONType> => {
  if (schema.type !== "object" || !schema.properties) return {};

  const result: JSONType = {};

  for (const key of Object.keys(schema.properties)) {
    result[key] = await props.configGetter(key);
  }

  return result;
};

onBeforeMount(async () => {
  data.value = await dataFromSchema(props.schema);
});
</script>

<template>
  <JSONForm
    v-if="Object.keys(data ?? {}).length !== 0"
    v-model:data="data"
    :schema
    @update="handleUpdate"
  />
  <div v-if="updated.size > 0" class="flex gap-2">
    <Button icon="i-mdi:content-save" @click="handleSave">{{
      t("保存")
    }}</Button>
  </div>
</template>
