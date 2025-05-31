<script setup lang="ts">
import { usePageContext } from "vike-vue/usePageContext";
import { onServerPrefetch } from "vue";
import PluginComponentRender from "./PluginComponentRender.vue";
import { PluginComponentSchema } from "@cat/shared";

const props = defineProps<{
  slotId: string;
}>();

const ctx = usePageContext();

onServerPrefetch(async () => {
  if (ctx.isClientSide) return;

  const { z } = await import("zod/v4");
  const { prisma } = await import("@cat/db");

  ctx.pluginComponents = z.array(PluginComponentSchema).parse(
    await prisma.pluginComponent.findMany({
      where: {
        slot: props.slotId,
        Plugin: {
          enabled: true,
        },
      },
    }),
  );
});
</script>

<template>
  <div>
    <Suspense>
      <PluginComponentRender
        v-for="component in ctx.pluginComponents"
        :key="component.id"
        :component
      />
    </Suspense>
  </div>
</template>
