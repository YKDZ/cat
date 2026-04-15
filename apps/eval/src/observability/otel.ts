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
    const otlpTraceExporter = new OTLPTraceExporter({
      url: `${config.otlpEndpoint}/v1/traces`,
    });
    spanProcessors.push(new BatchSpanProcessor(otlpTraceExporter));

    const otlpMetricExporter = new OTLPMetricExporter({
      url: `${config.otlpEndpoint}/v1/metrics`,
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
      await sdk.shutdown();
      await localMeterProvider.shutdown();
      if (otlpMeterProvider) {
        await otlpMeterProvider.shutdown();
      }
    },
  };
};
