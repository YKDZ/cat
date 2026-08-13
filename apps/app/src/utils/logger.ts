import {
  Logger,
  type DiagnosticEvent,
  type DiagnosticTransport,
} from "@cat/shared";

class ConsoleTransport implements DiagnosticTransport {
  emit(event: DiagnosticEvent): void {
    const args: unknown[] = [event.message, event];

    switch (event.level) {
      case "debug":
        // oxlint-disable-next-line no-console -- logger transport
        console.debug(...args);
        break;
      case "info":
        // oxlint-disable-next-line no-console -- logger transport
        console.info(...args);
        break;
      case "warn":
        // oxlint-disable-next-line no-console -- logger transport
        console.warn(...args);
        break;
      case "error":
      case "fatal":
        // oxlint-disable-next-line no-console -- logger transport
        console.error(...args);
        break;
    }
  }
}

export const clientLogger = new Logger({ runtime: "client" }, [
  new ConsoleTransport(),
]);
