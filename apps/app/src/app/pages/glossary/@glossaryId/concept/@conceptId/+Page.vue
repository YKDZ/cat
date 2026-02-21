<script setup lang="ts">
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.server";

const { concept, terms } = useData<Data>();
</script>

<template>
  {{ concept.subject }}
  {{ concept.definition }}
  <ul>
    <li v-for="term in terms" :key="term.id">
      {{ term.text }}
      {{ term.languageId }}
      {{ term.type }}
      {{ term.status }}
    </li>
  </ul>
</template>
