<script setup lang="ts">
import CurrentElement from "./CurrentElement.vue";
import Memories from "./Memories.vue";
import Suggestions from "./Suggestions.vue";
import Terms from "./Terms.vue";
import Toolbar from "./Toolbar.vue";
import TranslateInput from "./TranslateInput.vue";
import Translations from "./Translations.vue";
</script>

<template>
  <CurrentElement />
  <TranslateInput />
  <Toolbar />
  <Translations />
  <div class="flex flex-col md:grid md:grid-cols-3">
    <Suggestions />
    <Memories />
    <Terms />
  </div>
</template>
