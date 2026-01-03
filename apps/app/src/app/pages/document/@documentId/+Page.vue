<script setup lang="ts">
import { inject } from "vue";
import { useInjectionKey } from "@/app/utils/provide.ts";
import type { Data } from "./+data.server";

const document = inject(useInjectionKey<Data>()("document"));
</script>

<template>文档内容和相关信息展示 {{ document }}</template>
