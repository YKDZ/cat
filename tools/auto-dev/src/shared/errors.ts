export class DecisionLimitReachedError extends Error {
  public readonly remainingDecisions: number;

  constructor(max: number) {
    super(`Decision limit reached (max: ${max})`);
    this.name = "DecisionLimitReachedError";
    this.remainingDecisions = 0;
  }
}

export class DecisionNotFoundError extends Error {
  constructor(decisionId: string) {
    super(`Decision not found: ${decisionId}`);
    this.name = "DecisionNotFoundError";
  }
}

export class SocketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocketError";
  }
}

export class ConfigLoadError extends Error {
  constructor(message: string) {
    super(`Configuration error: ${message}`);
    this.name = "ConfigLoadError";
  }
}

export class ValidationError extends Error {
  public readonly details: string[];

  constructor(details: string[]) {
    super(`Validation failed: ${details.join("; ")}`);
    this.name = "ValidationError";
    this.details = details;
  }
}
