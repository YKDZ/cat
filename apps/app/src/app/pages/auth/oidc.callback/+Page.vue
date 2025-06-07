<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import { usePageContext } from "vike-vue/usePageContext";
import { onMounted } from "vue";
import { navigate } from "vike/client/router";
import type { TRPCError } from "@trpc/server";
import { useAuthStore } from "@/app/stores/auth";
import Loading from "@/app/components/Loading.vue";

const ctx = usePageContext();

const state = ctx.urlParsed.search.state;
const code = ctx.urlParsed.search.code;

const auth = useAuthStore();

onMounted(() => {
  trpc.auth.oidc.callback
    .mutate({
      state,
      code,
    })
    .then(() => {
      navigate("/");
    })
    .catch((e: TRPCError) => {
      auth.setError(e);
      navigate("/auth");
    });
});
</script>

<template><Loading size="200px" /></template>
