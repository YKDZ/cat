<script setup lang="ts">
import ElementTranslations from "./ElementTranslations.vue";
import Memories from "./Memories.vue";
import CurrentElement from "./CurrentElement.vue";
import Suggestions from "./Suggestions.vue";
import Terms from "./Terms.vue";
import Toolbar from "./Toolbar.vue";
import TranslateInput from "./TranslateInput.vue";
</script>

<template>
  <CurrentElement />
  <TranslateInput />
  <Toolbar />
  <ElementTranslations />
  <div class="flex flex-col md:grid md:grid-cols-3">
    <Suggestions />
    <Memories />
    <Terms />
  </div>
</template>
