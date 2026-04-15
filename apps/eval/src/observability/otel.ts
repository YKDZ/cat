import {
  AggregationTemporality,
  MeterProvider,
  PeriodicExportingMetricReader,
  InMemoryMetricExporter,
} from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
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

export const initObservability = (_config: OTelConfig = {}): OTelHandle => {
  const spanExporter = new InMemorySpanExporter();
  const metricExporter = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE,
  );

  const sdk = new NodeSDK({
    spanProcessors: [new SimpleSpanProcessor(spanExporter)],
    serviceName: "cat-eval",
  });

  const meterProvider = new MeterProvider({
    readers: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 5000,
      }),
    ],
  });

  sdk.start();

  return {
    spanExporter,
    metricExporter,
    shutdown: async () => {
      await sdk.shutdown();
      await meterProvider.shutdown();
    },
  };
};
