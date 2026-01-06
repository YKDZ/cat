<script setup lang="ts">
import { usePluginStore } from "@/app/stores/plugin";
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import { computed, defineAsyncComponent, onServerPrefetch } from "vue";

const PluginComponentClient = defineAsyncComponent(
  () => import("./PluginComponentClient.vue"),
);

const props = defineProps<{
  id: string;
}>();

const ctx = usePageContext();
const { components } = storeToRefs(usePluginStore());
const { addComponents } = usePluginStore();

const slotComponents = computed(() => {
  return components.value.get(props.id) ?? [];
});

onServerPrefetch(() => {
  if (ctx.isClientSide) return;

  const compos = ctx.globalContext.pluginRegistry.getComponentOfSlot(props.id);

  addComponents(props.id, compos);
});
</script>

<template>
  <div :data-slot="id">
    <div
      v-for="component in slotComponents"
      :key="component.name"
      class="block"
    >
      <Suspense>
        <PluginComponentClient :component="component" />
      </Suspense>
    </div>
  </div>
</template>
