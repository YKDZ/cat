<script setup lang="ts">
import IndexHeader from "@/app/components/IndexHeader.vue";
import IndexSidebar from "@/app/components/IndexSidebar.vue";
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <header>
        <IndexHeader />
      </header>
      <main>
        <div class="p-4 flex flex-col gap-2">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
