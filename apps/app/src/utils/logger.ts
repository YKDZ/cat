import { Logger, type LoggerTransport, type LogEntry } from "@cat/shared/utils";

class ConsoleTransport implements LoggerTransport {
  log(entry: LogEntry) {
    const { level, situation, message, payload, error } = entry;
    const prefix = `[${situation}]`;

    const args: any[] = [prefix, message];
    if (payload && Object.keys(payload).length > 0) {
      args.push(payload);
    }
    if (error) {
      args.push(error);
    }

    switch (level) {
      case "debug":
        console.debug(...args);
        break;
      case "info":
        console.info(...args);
        break;
      case "warn":
        console.warn(...args);
        break;
      case "error":
      case "fatal":
        console.error(...args);
        break;
    }
  }
}

export const clientLogger = new Logger("APP", [new ConsoleTransport()]);
