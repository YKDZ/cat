<script setup lang="ts">
import { useToastStore } from "@/app/stores/toast";
import { trpc } from "@/server/trpc/client";
import type { JSONType, PluginConfig } from "@cat/shared";
import { onBeforeMount, ref, shallowRef, watch } from "vue";
import JSONForm from "./json-form/JSONForm.vue";
import Toggler from "./Toggler.vue";
import { diffJson } from "diff";

const props = defineProps<{
  config: PluginConfig;
}>();

const { info, trpcWarn } = useToastStore();
const isActive = ref(true);
const data = shallowRef<JSONType>({});

const handleUpsert = async (to: JSONType) => {
  const diffResult = diffJson(JSON.stringify(data.value), JSON.stringify(to));

  await trpc.plugin.upsertUserConfig
    .mutate({
      configId: props.config.id,
      value: to,
    })
    .then(() => {
      diffResult.forEach((result) => {
        if (result.added) {
          info(`成功在配置 ${props.config.key} 中添加了 ${result.value}`);
        } else if (result.removed) {
          info(`成功从配置 ${props.config.key} 中删除了 ${result.value}`);
        }
      });
      data.value = to;
    })
    .catch(trpcWarn);
};

const handleUpdateActive = async (to: boolean) => {
  await trpc.plugin.updateUserConfig
    .mutate({
      configId: props.config.id,
      isActive: to,
    })
    .then(() => {
      info(`成功应用${to ? "你的配置" : "全局配置"}`);
    })
    .catch(trpcWarn);
};

const updateValue = async () => {
  await trpc.plugin.queryUserConfigInstance
    .query({
      configId: props.config.id,
    })
    .then((instance) => {
      if (!instance) return;
      data.value = instance.value;
      isActive.value = instance.isActive;
    });
};

watch(isActive, handleUpdateActive);

onBeforeMount(updateValue);
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <div class="flex gap-1 items-center">
      <span>{{ config.key }}</span>
      <Toggler v-model="isActive" />
    </div>
    <JSONForm :data :schema="config.schema" @update="handleUpsert" />
  </div>
</template>
