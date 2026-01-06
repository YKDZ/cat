<script setup lang="ts">
import { orpc } from "@/server/orpc";
import { useQuery } from "@pinia/colada";
import { defineAsyncComponent } from "vue";

const PluginComponentClient = defineAsyncComponent(
  () => import("./PluginComponentClient.vue"),
);

const props = defineProps<{
  id: string;
}>();

const { state } = useQuery({
  key: ["slot", props.id],
  placeholderData: [],
  query: () =>
    orpc.plugin.getAllComponentsOfSlot({
      slotId: props.id,
    }),
  enabled: !import.meta.env.SSR,
});
</script>

<template>
  <div :data-slot="id">
    <div v-for="component in state.data" :key="component.name" class="block">
      <Suspense>
        <PluginComponentClient :component="component" />
      </Suspense>
    </div>
  </div>
</template>
