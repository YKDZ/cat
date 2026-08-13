export const requestIdHeader = "x-cat-request-id";

export type RequestCancellationKind = "consumer" | "navigation" | "signal";

export type ExpectedRequestCancellation = Readonly<{
  expected: true;
  id: string;
  kind: RequestCancellationKind;
  time: number;
  url: string;
  version: 1;
}>;

export class RequestCancellationRegistry {
  private readonly activeRequests = new Map<string, string>();
  private readonly expectedCancellations = new Map<
    string,
    ExpectedRequestCancellation
  >();

  public register(id: string, url: string): void {
    this.activeRequests.set(id, url);
  }

  public cancel(
    id: string,
    kind: RequestCancellationKind,
  ): ExpectedRequestCancellation | undefined {
    const url = this.activeRequests.get(id);
    if (url === undefined) return undefined;

    const existing = this.expectedCancellations.get(id);
    if (existing !== undefined) return undefined;

    const cancellation = {
      expected: true,
      id,
      kind,
      time: Date.now(),
      url,
      version: 1,
    } as const;
    this.expectedCancellations.set(id, cancellation);
    return cancellation;
  }

  public cancelActive(
    kind: RequestCancellationKind,
  ): ExpectedRequestCancellation[] {
    return [...this.activeRequests.keys()]
      .map((id) => this.cancel(id, kind))
      .filter(
        (cancellation): cancellation is ExpectedRequestCancellation =>
          cancellation !== undefined,
      );
  }

  public expected(id: string): ExpectedRequestCancellation | undefined {
    return this.expectedCancellations.get(id);
  }

  public settle(id: string): void {
    this.activeRequests.delete(id);
    this.expectedCancellations.delete(id);
  }

  public activeRequestIds(): string[] {
    return [...this.activeRequests.keys()];
  }
}

const hot = import.meta.hot;
const hotData = hot?.data;
const isWeakSet = (value: unknown): value is WeakSet<object> =>
  Object.prototype.toString.call(value) === "[object WeakSet]";
const isWeakMap = (
  value: unknown,
): value is WeakMap<object, ExpectedRequestCancellation> =>
  Object.prototype.toString.call(value) === "[object WeakMap]";
const cancellationErrors = isWeakSet(hotData?.expectedRequestCancellationErrors)
  ? hotData.expectedRequestCancellationErrors
  : new WeakSet<object>();
const cancellationPayloads = isWeakMap(
  hotData?.expectedRequestCancellationPayloads,
)
  ? hotData.expectedRequestCancellationPayloads
  : new WeakMap<object, ExpectedRequestCancellation>();

if (hot) {
  hot.dispose((data) => {
    data.expectedRequestCancellationErrors = cancellationErrors;
    data.expectedRequestCancellationPayloads = cancellationPayloads;
  });
}

const isBrandedCancellationError = (value: unknown): value is Error =>
  typeof value === "object" && value !== null && cancellationErrors.has(value);

export class ExpectedRequestCancellationError extends Error {
  public constructor(cancellation: ExpectedRequestCancellation) {
    super("CAT request was cancelled");
    this.name = "ExpectedRequestCancellationError";
    cancellationErrors.add(this);
    cancellationPayloads.set(this, cancellation);
  }
}

export const expectedRequestCancellation = (
  value: unknown,
): ExpectedRequestCancellation | undefined => {
  const visited = new Set<object>();
  let current = value;
  while (typeof current === "object" && current !== null) {
    if (visited.has(current)) return undefined;
    visited.add(current);
    const cancellation = isBrandedCancellationError(current)
      ? cancellationPayloads.get(current)
      : undefined;
    if (typeof cancellation === "object" && cancellation !== null) {
      const expected = Reflect.get(cancellation, "expected");
      const version = Reflect.get(cancellation, "version");
      const kind = Reflect.get(cancellation, "kind");
      const id = Reflect.get(cancellation, "id");
      const url = Reflect.get(cancellation, "url");
      const time = Reflect.get(cancellation, "time");
      if (
        expected === true &&
        version === 1 &&
        (kind === "consumer" || kind === "navigation" || kind === "signal") &&
        typeof id === "string" &&
        typeof url === "string" &&
        typeof time === "number"
      ) {
        return cancellation;
      }
    }
    current = Reflect.get(current, "cause");
  }
  return undefined;
};

export const isExpectedRequestCancellationFor = (
  error: unknown,
  request: Request,
): boolean => {
  const cancellation = expectedRequestCancellation(error);
  return (
    cancellation !== undefined &&
    request.headers.get(requestIdHeader) === cancellation.id
  );
};

export const isExpectedNavigationCancellation = (
  value: unknown,
): value is ExpectedRequestCancellationError => {
  if (
    !isBrandedCancellationError(value) ||
    value.name !== "ExpectedRequestCancellationError"
  ) {
    return false;
  }
  const cancellation = cancellationPayloads.get(value);
  return (
    typeof cancellation === "object" &&
    cancellation !== null &&
    Reflect.get(cancellation, "kind") === "navigation" &&
    expectedRequestCancellation(value)?.kind === "navigation"
  );
};
