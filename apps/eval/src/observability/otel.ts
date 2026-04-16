// oxlint-disable no-console -- intentional diagnostic logging for OTLP export errors
import type { SpanProcessor } from "@opentelemetry/sdk-trace-node";

import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  AggregationTemporality,
  MeterProvider,
  PeriodicExportingMetricReader,
  InMemoryMetricExporter,
} from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  InMemorySpanExporter,
} from "@opentelemetry/sdk-trace-node";

export type OTelConfig = {
  otlpEndpoint?: string;
  otlpHeaders?: Record<string, string>;
};

export type OTelHandle = {
  spanExporter: InMemorySpanExporter;
  metricExporter: InMemoryMetricExporter;
  shutdown: () => Promise<void>;
};

export const initObservability = (config: OTelConfig = {}): OTelHandle => {
  const inMemorySpanExporter = new InMemorySpanExporter();
  const inMemoryMetricExporter = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE,
  );

  const spanProcessors: SpanProcessor[] = [
    new SimpleSpanProcessor(inMemorySpanExporter),
  ];
  const metricReaders = [
    new PeriodicExportingMetricReader({
      exporter: inMemoryMetricExporter,
      exportIntervalMillis: 5000,
    }),
  ];

  let otlpMeterProvider: MeterProvider | undefined;

  if (config.otlpEndpoint) {
    const headers = config.otlpHeaders ?? {};
    const otlpTraceExporter = new OTLPTraceExporter({
      url: `${config.otlpEndpoint}/v1/traces`,
      headers,
    });
    spanProcessors.push(new BatchSpanProcessor(otlpTraceExporter));

    const otlpMetricExporter = new OTLPMetricExporter({
      url: `${config.otlpEndpoint}/v1/metrics`,
      headers,
    });
    otlpMeterProvider = new MeterProvider({
      readers: [
        new PeriodicExportingMetricReader({
          exporter: otlpMetricExporter,
          exportIntervalMillis: 2000,
        }),
      ],
    });
  }

  const sdk = new NodeSDK({
    spanProcessors,
    serviceName: "cat-eval",
  });

  const localMeterProvider = new MeterProvider({
    readers: metricReaders,
  });

  sdk.start();

  return {
    spanExporter: inMemorySpanExporter,
    metricExporter: inMemoryMetricExporter,
    shutdown: async () => {
      try {
        await sdk.shutdown();
      } catch (err) {
        console.warn(
          "[otel] SDK shutdown error (traces may not be exported):",
          String(err),
        );
      }
      try {
        await localMeterProvider.shutdown();
      } catch {
        // local meter provider shutdown failure is non-critical
      }
      if (otlpMeterProvider) {
        try {
          await otlpMeterProvider.shutdown();
        } catch (err) {
          console.warn("[otel] Metric provider shutdown error:", String(err));
        }
      }
    },
  };
};
