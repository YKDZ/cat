import { Logger, type LoggerTransport, type LogEntry } from "@cat/shared/utils";

class ConsoleTransport implements LoggerTransport {
  log(entry: LogEntry) {
    const { level, situation, message, payload, error } = entry;
    const prefix = `[${situation}]`;

    const args: unknown[] = [prefix, message];
    if (payload && Object.keys(payload).length > 0) {
      args.push(payload);
    }
    if (error) {
      args.push(error);
    }

    switch (level) {
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

export const clientLogger = new Logger("APP", [new ConsoleTransport()]);
