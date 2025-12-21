<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

const time = ref("");
const weather = ref<null | {
  temp: number;
  code: number;
}>(null);

let timer: number | undefined;

function updateTime() {
  const now = new Date();
  time.value = now.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function fetchWeather(lat: number, lon: number) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current_weather=true`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.current_weather) {
    weather.value = {
      temp: data.current_weather.temperature,
      code: data.current_weather.weathercode,
    };
  }
}

function getWeatherEmoji(code: number) {
  if (code === 0) return "☀️";
  if (code < 4) return "🌤️";
  if (code < 50) return "🌥️";
  if (code < 70) return "🌧️";
  if (code < 80) return "❄️";
  return "🌩️";
}

onMounted(() => {
  updateTime();
  timer = window.setInterval(updateTime, 1000);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetchWeather(pos.coords.latitude, pos.coords.longitude);
      },
      () => {},
      { timeout: 3000 },
    );
  }
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="card">
    <div class="content">
      <div class="time">{{ time }}</div>

      <div class="weather" v-if="weather">
        <span class="emoji">{{ getWeatherEmoji(weather.code) }}</span>
        <span class="temp">{{ weather.temp }}°C</span>
      </div>

      <div class="weather muted" v-else>正在获取天气…</div>
    </div>
  </div>
</template>

<style scoped>
.card {
  width: 180px;
  padding: 12px;
  border-radius: 14px;
  background: linear-gradient(145deg, #ffffff, #f3f3f3);
  box-shadow:
    0 8px 20px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont;
  color: #333;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
}

.time {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.weather {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}

.weather .emoji {
  font-size: 18px;
}

.muted {
  opacity: 0.6;
  font-size: 12px;
}
</style>
