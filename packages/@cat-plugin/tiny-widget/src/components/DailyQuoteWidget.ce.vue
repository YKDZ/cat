<script setup lang="ts">
import { ref, onMounted } from "vue";

type Quote = {
  quote: string;
  author: string;
};

const loading = ref(true);
const error = ref<string | null>(null);
const quote = ref<Quote | null>(null);

const fetchQuote = async () => {
  try {
    const res = await fetch("https://dummyjson.com/quotes/random");

    if (!res.ok) {
      throw new Error("network error");
    }

    const json = (await res.json()) as Quote;
    quote.value = json;
  } catch (e) {
    error.value = "Can not fetch quote";
    console.log(e);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchQuote();
});
</script>

<template>
  <div class="card">
    <div class="header">Daily Quote</div>

    <div v-if="loading" class="muted">Loading...</div>

    <div v-else-if="error" class="muted">
      {{ error }}
    </div>

    <template v-else-if="quote">
      <div class="quote">“{{ quote.quote }}”</div>

      <div class="author">— {{ quote.author }}</div>
    </template>
  </div>
</template>

<style scoped>
.card {
  width: 260px;
  padding: 14px 16px 16px;
  border-radius: 12px;
  background: #ffffff;
  color: #1f2328;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}

.header {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #6e7781;
  margin-bottom: 8px;
}

.quote {
  font-size: 14px;
  line-height: 1.6;
  font-weight: 500;
}

.author {
  margin-top: 10px;
  font-size: 12px;
  text-align: right;
  opacity: 0.65;
}

.muted {
  font-size: 13px;
  opacity: 0.6;
  text-align: center;
}
</style>
