<script setup lang="ts">
import type { Plugin } from "@cat/shared/schema/drizzle/plugin";
import { computed, ref } from "vue";
import { useEventListener } from "@vueuse/core";
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";
import Card from "@/app/components/ui/card/Card.vue";
import CardHeader from "@/app/components/ui/card/CardHeader.vue";
import CardTitle from "@/app/components/ui/card/CardTitle.vue";
import { computedAsyncClient } from "@/app/utils/vue";
import { orpc } from "@/server/orpc";
import type { ScopeType } from "@cat/shared/schema/drizzle/enum";

const { t } = useI18n();

const props = defineProps<{
  plugin: Plugin;
  scopeType: ScopeType;
  scopeId: string;
  pathPrefix: string;
}>();

const iconImgEl = ref<HTMLImageElement>();
const isIconLoaded = ref(false);

const simpleName = computed(() => {
  return props.plugin.name.replace("@cat-plugin/", "");
});

const isInstalled = computedAsyncClient(async () => {
  return await orpc.plugin.isInstalled({
    pluginId: props.plugin.id,
    scopeType: props.scopeType,
    scopeId: props.scopeId,
  });
}, false);

useEventListener(iconImgEl.value, "load", () => (isIconLoaded.value = true));
</script>

<template>
  <Card
    @click="navigate(`${props.pathPrefix}/${props.plugin.id}`)"
    class="cursor-pointer hover:scale-101"
  >
    <CardHeader class="flex gap-2"
      ><div>
        <img
          v-show="plugin.iconUrl && isIconLoaded"
          ref="iconImgEl"
          :src="plugin.iconUrl ?? ``"
          class="rounded-md max-h-12 min-h-12 min-w-12 aspect-ratio-square object-cover"
        />
        <span
          v-if="!isIconLoaded"
          class="text-3xl text-primary-foreground rounded-md bg-primary inline-flex h-12 w-12 aspect-ratio-square select-none items-center justify-center"
          >{{ simpleName.charAt(0).toUpperCase() }}</span
        >
      </div>
      <div class="flex flex-col gap-2">
        <CardTitle>{{ simpleName }}</CardTitle>
        <div
          class="text-xs text-muted-foreground flex gap-1 select-none text-nowrap items-center"
        >
          <span
            v-if="plugin.isExternal"
            class="px-2 py-1 rounded-sm bg-muted"
            >{{ t("内部插件") }}</span
          >
          <span v-if="isInstalled" class="px-2 py-1 rounded-sm bg-muted">{{
            t("已安装")
          }}</span>
        </div>
      </div>
    </CardHeader>
  </Card>
</template>
