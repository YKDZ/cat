<script setup lang="ts">
import { onBeforeMount, ref, shallowRef } from "vue";
import { useDebounceFn } from "@vueuse/core";
import type { JSONSchema, JSONType } from "@cat/shared/schema/json";
import JSONForm from "@/app/components/json-form/JSONForm.vue";

const props = defineProps<{
  configGetter: () => Promise<JSONType>;
  configSetter: (
    value: JSONType,
    schema: JSONSchema,
    key?: string,
  ) => Promise<void>;
  schema: JSONSchema;
}>();

const data = shallowRef<JSONType>({});
const isPending = ref(false);

const debouncedFunctions = new Map<string, ReturnType<typeof useDebounceFn>>();

const getDelayByType = (schema: JSONSchema): number => {
  if (schema.enum || schema.const) return 0;

  switch (schema.type) {
    case "string":
      return 1000;
    case "number":
    case "integer":
      return 800;
    case "boolean":
      return 0;
    case "array":
      return 300;
    case "object":
      return 500;
    default:
      return 500;
  }
};

const handleUpdate = async (
  value: JSONType,
  schema: JSONSchema,
  key?: string,
) => {
  if (!key) {
    await props.configSetter(value, schema, key);
    return;
  }

  const delay = getDelayByType(schema);
  const debouncedKey = key;

  let debouncedFn = debouncedFunctions.get(debouncedKey);
  if (!debouncedFn) {
    if (delay === 0) {
      // 无延迟，创建立即执行的函数
      debouncedFn = async (v: JSONType, s: JSONSchema, k?: string) => {
        isPending.value = true;
        try {
          await props.configSetter(v, s, k);
          data.value = value;
        } finally {
          isPending.value = false;
        }
      };
    } else {
      debouncedFn = useDebounceFn(
        async (v: JSONType, s: JSONSchema, k?: string) => {
          try {
            await props.configSetter(v, s, k);
            data.value = value;
          } finally {
            isPending.value = false;
          }
        },
        delay,
      );
    }
    debouncedFunctions.set(debouncedKey, debouncedFn);
  }

  isPending.value = true;

  await debouncedFn(value, schema, key);
};

onBeforeMount(async () => {
  data.value = await props.configGetter();
});
</script>

<template>
  <JSONForm
    :data
    :schema
    @update="handleUpdate"
    :classes="{
      label: 'flex flex-col gap-0.5 mt-2',
      'label-title': 'text-xl font-bold text-highlight-content-darker',
      'label-description': 'text text-highlight-content',
    }"
  />
</template>
