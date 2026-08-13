<script setup lang="ts">
import { onMounted, shallowRef, type Component } from "vue";

const applicationProbe = shallowRef<Component>();
const privateJitProbe = shallowRef<Component>();

type ComponentModule = { default: Component };

const isComponentModule = (value: unknown): value is ComponentModule =>
  typeof value === "object" && value !== null && "default" in value;

const installProbes = (
  application: ComponentModule | undefined,
  privateJit: ComponentModule | undefined,
): void => {
  if (application !== undefined) applicationProbe.value = application.default;
  if (privateJit !== undefined) privateJitProbe.value = privateJit.default;
};

onMounted(async () => {
  const [application, privateJit] = await Promise.all([
    import("#e2e-hmr-application"),
    import("@cat/e2e-hmr-private"),
  ]);
  installProbes(application, privateJit);
});

if (import.meta.hot) {
  import.meta.hot.accept(
    ["#e2e-hmr-application", "@cat/e2e-hmr-private"],
    ([application, privateJit]) => {
      installProbes(
        isComponentModule(application) ? application : undefined,
        isComponentModule(privateJit) ? privateJit : undefined,
      );
    },
  );
}
</script>

<template>
  <component :is="applicationProbe" />
  <component :is="privateJitProbe" />
</template>
