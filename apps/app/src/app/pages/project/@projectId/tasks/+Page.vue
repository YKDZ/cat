<script setup lang="ts">
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";

const { tasks } = useData<Data>();
</script>

<template>{{ tasks }}</template>
