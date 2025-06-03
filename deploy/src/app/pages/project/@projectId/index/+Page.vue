<script setup lang="ts">
import ProjectLanguageList from "@/app/components/ProjectLanguageList.vue";
import ProjectDetailCard from "@/app/components/ProjectDetailCard.vue";
</script>

<template>
  <div class="mt-3 flex gap-6 w-full items-start">
    <ProjectLanguageList />
    <ProjectDetailCard />
  </div>
</template>
