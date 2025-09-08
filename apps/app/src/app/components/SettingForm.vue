<script setup lang="ts">
import { computed, onBeforeMount, ref, shallowRef } from "vue";
import type { JSONSchema, JSONType } from "@cat/shared";
import JSONForm from "./json-form/JSONForm.vue";
import Icon from "./Icon.vue";

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

// 节流器 Map，为每个配置项创建独立的节流器
const throttlers = new Map<
  string,
  {
    timer: NodeJS.Timeout | null;
    latestValue: JSONType;
  }
>();

const title = computed(() => {
  return props.schema.title;
});

const description = computed(() => {
  return props.schema.description;
});

// 根据 JSON Schema 类型获取延迟时间
const getDelayByType = (schema: JSONSchema): number => {
  if (schema.enum || schema.const) return 0; // 枚举和常量类型

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
  const throttlerKey = key;

  // 获取或创建节流器
  let throttler = throttlers.get(throttlerKey);
  if (!throttler) {
    throttler = { timer: null, latestValue: value };
    throttlers.set(throttlerKey, throttler);
  }

  // 清除之前的定时器
  if (throttler.timer) {
    clearTimeout(throttler.timer);
  }

  // 保存最新值
  throttler.latestValue = value;

  // 设置状态为 pending
  isPending.value = true;

  if (delay === 0) {
    // 无延迟，立即执行
    await props.configSetter(value, schema, key);
    isPending.value = false;
  } else {
    // 设置新的定时器
    throttler.timer = setTimeout(async () => {
      try {
        await props.configSetter(throttler!.latestValue, schema, key);
      } finally {
        isPending.value = false;
        // 清理定时器引用
        if (throttler) {
          throttler.timer = null;
        }
      }
    }, delay);
  }
};

onBeforeMount(async () => {
  data.value = await props.configGetter();
});
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="flex flex-col gap-0.5">
      <div class="flex items-center gap-2">
        <h3 class="text-lg text-highlight-content-darker font-bold mt-4">
          {{ title }}
        </h3>
        <Icon
          v-if="isPending"
          icon="i-mdi:circle"
          class="bg-warning-darkest animate-bounce"
        />
        <Icon v-else icon="i-mdi:check" class="bg-success-darkest" />
      </div>
      <p class="text-sm text-highlight-content">{{ description }}</p>
    </div>
    <JSONForm
      v-if="Object.keys(data ?? {}).length !== 0"
      v-model:data="data"
      :schema
      @update="handleUpdate"
    />
  </div>
</template>
