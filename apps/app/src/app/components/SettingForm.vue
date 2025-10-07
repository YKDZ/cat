<script setup lang="ts">
import { onMounted, ref, shallowRef } from "vue";
import { useDebounceFn } from "@vueuse/core";
import type { JSONSchema, NonNullJSONType } from "@cat/shared/schema/json";
import JsonForm from "@/app/components/json-form/JsonForm.vue";

const props = defineProps<{
  configGetter: () => Promise<NonNullJSONType>;
  configSetter: (
    value: NonNullJSONType,
    schema: JSONSchema,
    key: string | number,
  ) => Promise<void>;
  schema: JSONSchema;
}>();

const data = shallowRef<NonNullJSONType>({});
const isPending = ref(false);

const debouncedFunctions = new Map<string, ReturnType<typeof useDebounceFn>>();

const getDelayByType = (schema: JSONSchema): number => {
  if (typeof schema === "boolean") return 0;

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
  value: NonNullJSONType,
  schema: JSONSchema,
  key: string | number,
) => {
  if (!key) {
    await props.configSetter(value, schema, key);
    return;
  }

  const delay = getDelayByType(schema);
  const debouncedKey = `${key}`;

  let debouncedFn = debouncedFunctions.get(debouncedKey);
  if (!debouncedFn) {
    if (delay === 0) {
      // 无延迟，创建立即执行的函数
      debouncedFn = async (
        v: NonNullJSONType,
        s: JSONSchema,
        k: string | number,
      ) => {
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
        async (v: NonNullJSONType, s: JSONSchema, k: string | number) => {
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

onMounted(async () => {
  data.value = await props.configGetter();
});
</script>

<template>
  <JsonForm
    v-if="typeof schema === 'object' && Object.keys(data).length > 0"
    :data
    :schema
    @update="handleUpdate"
  />
</template>
