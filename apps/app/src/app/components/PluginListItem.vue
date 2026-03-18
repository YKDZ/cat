<script setup lang="ts">
import type { ScopeType } from "@cat/shared/schema/drizzle/enum";
import type { Plugin } from "@cat/shared/schema/drizzle/plugin";

import { Card, CardHeader, CardTitle } from "@cat/ui";
import { useQuery } from "@pinia/colada";
import { useEventListener } from "@vueuse/core";
import { navigate } from "vike/client/router";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import { orpc } from "@/server/orpc";

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


const { state } = useQuery({
  key: ["isInstalled", props.plugin.id],
  placeholderData: false,
  query: () =>
    orpc.plugin.isInstalled({
      pluginId: props.plugin.id,
      scopeType: props.scopeType,
      scopeId: props.scopeId,
    }),
});


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
          class="aspect-ratio-square max-h-12 min-h-12 min-w-12 rounded-md object-cover"
        />
        <span
          v-if="!isIconLoaded"
          class="aspect-ratio-square inline-flex h-12 w-12 items-center justify-center rounded-md bg-primary text-3xl text-primary-foreground select-none"
          >{{ simpleName.charAt(0).toUpperCase() }}</span
        >
      </div>
      <div class="flex flex-col gap-2">
        <CardTitle>{{ simpleName }}</CardTitle>
        <div
          class="flex items-center gap-1 text-xs text-nowrap text-muted-foreground select-none"
        >
          <span
            v-if="plugin.isExternal"
            class="rounded-sm bg-muted px-2 py-1"
            >{{ t("内部插件") }}</span
          >
          <span v-if="state.data" class="rounded-sm bg-muted px-2 py-1">{{
            t("已安装")
          }}</span>
        </div>
      </div>
    </CardHeader>
  </Card>
</template>
