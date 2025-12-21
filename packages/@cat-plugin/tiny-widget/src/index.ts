import { defineCustomElement } from "vue";
import WeatherWidgetCE from "./WeatherWidget.ce.vue";

const WeatherWidget = defineCustomElement(WeatherWidgetCE);

export { WeatherWidget };
