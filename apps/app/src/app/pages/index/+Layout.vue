<script setup lang="ts">
import IndexHeader from "@/app/components/IndexHeader.vue";
import IndexSidebar from "@/app/components/IndexSidebar.vue";
</script>

<template>
  <div class="flex h-full w-full flex-col md:flex-row">
    <IndexSidebar />
    <div class="flex h-full w-full flex-col overflow-y-auto">
      <header>
        <IndexHeader />
      </header>
      <main>
        <div class="flex flex-col gap-2 p-4">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
