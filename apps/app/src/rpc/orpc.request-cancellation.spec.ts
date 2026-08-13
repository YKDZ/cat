import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  errorHandler: null as
    | ((error: unknown, options: { request: Request }) => void)
    | null,
  logError: vi.fn(),
  rpcLinkOptions: null as {
    fetch: (request: Request, init: RequestInit) => Promise<Response>;
    headers: () => Record<string, string>;
  } | null,
}));

vi.mock("@orpc/client", () => ({
  createORPCClient: (link: unknown) => link,
  onError: (handler: typeof mocks.errorHandler) => {
    mocks.errorHandler = handler;
    return handler;
  },
}));

vi.mock("@orpc/client/fetch", () => ({
  RPCLink: function RPCLink(options: NonNullable<typeof mocks.rpcLinkOptions>) {
    mocks.rpcLinkOptions = options;
    return { options };
  },
}));

vi.mock("#/utils/logger.ts", () => ({
  clientLogger: {
    child: () => ({ error: mocks.logError }),
  },
}));

describe("oRPC request cancellation", () => {
  beforeEach(() => {
    vi.resetModules();
    Reflect.deleteProperty(
      window,
      Symbol.for("cat.orpc.request-cancellation-state"),
    );
    mocks.errorHandler = null;
    mocks.logError.mockReset();
    mocks.rpcLinkOptions = null;
  });

  it("adds one request ID, publishes one navigation cancellation, and settles it", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn<(request: Request) => Promise<Response>>(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const cancellations: unknown[] = [];
    const recordCancellation = (event: Event): void => {
      cancellations.push(Reflect.get(event, "detail"));
    };
    window.addEventListener("cat:request-cancelled", recordCancellation);
    try {
      await import("./orpc.ts");
      const options = mocks.rpcLinkOptions;
      if (options === null) throw new Error("Missing RPC link options");
      const headers = options.headers();
      const request = new Request("http://cat.test/api/rpc/ghostText/suggest", {
        headers,
      });
      const pending = options.fetch(request, {});
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      const instrumentedRequest = fetchMock.mock.calls[0]?.[0];
      if (!(instrumentedRequest instanceof Request))
        throw new Error("RPC fetch did not receive a Request");
      const requestId = instrumentedRequest.headers.get("x-cat-request-id");
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(requestId).toBe(headers["x-cat-request-id"]);

      window.dispatchEvent(new Event("beforeunload"));
      window.dispatchEvent(new Event("pagehide"));
      expect(cancellations).toHaveLength(1);
      expect(cancellations[0]).toMatchObject({
        expected: true,
        id: requestId,
        kind: "navigation",
        url: instrumentedRequest.url,
        version: 1,
      });

      resolveFetch?.(new Response(null, { status: 204 }));
      await pending;
      window.dispatchEvent(new Event("beforeunload"));
      expect(cancellations).toHaveLength(1);
    } finally {
      window.removeEventListener("cat:request-cancelled", recordCancellation);
      vi.unstubAllGlobals();
    }
  });

  it("reports signal cancellation and suppresses only the matching expected error", async () => {
    let rejectFetch: ((error: Error) => void) | undefined;
    const fetchMock = vi.fn<(request: Request) => Promise<Response>>(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectFetch = reject;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const cancellations: unknown[] = [];
    const recordCancellation = (event: Event): void => {
      cancellations.push(Reflect.get(event, "detail"));
    };
    window.addEventListener("cat:request-cancelled", recordCancellation);
    try {
      await import("./orpc.ts");
      const controller = new AbortController();
      const options = mocks.rpcLinkOptions;
      if (options === null) throw new Error("Missing RPC link options");
      const headers = options.headers();
      const adapterRequest = new Request(
        "http://cat.test/api/rpc/ghostText/suggest",
        {
          headers,
          signal: controller.signal,
        },
      );
      const pending = options.fetch(adapterRequest, {});
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      const instrumentedRequest = fetchMock.mock.calls[0]?.[0];
      if (!(instrumentedRequest instanceof Request))
        throw new Error("RPC fetch did not receive a Request");
      controller.abort();
      rejectFetch?.(new Error("request aborted"));
      const error = await pending.then(
        () => undefined,
        (failure: unknown) => failure,
      );
      if (error === undefined)
        throw new Error("Expected cancelled request to fail");
      expect(cancellations).toContainEqual(
        expect.objectContaining({
          expected: true,
          id: instrumentedRequest.headers.get("x-cat-request-id"),
          kind: "signal",
        }),
      );

      expect(instrumentedRequest.headers.get("x-cat-request-id")).toBe(
        adapterRequest.headers.get("x-cat-request-id"),
      );
      mocks.errorHandler?.(error, { request: adapterRequest });
      expect(mocks.logError).not.toHaveBeenCalled();
      mocks.errorHandler?.(error, {
        request: new Request(instrumentedRequest, {
          headers: { "x-cat-request-id": "another-request" },
        }),
      });
      expect(mocks.logError).toHaveBeenCalledOnce();

      const expectedRejection = new Event("unhandledrejection", {
        cancelable: true,
      });
      Object.defineProperty(expectedRejection, "reason", { value: error });
      window.dispatchEvent(expectedRejection);
      expect(expectedRejection.defaultPrevented).toBe(false);

      const unexpectedRejection = new Event("unhandledrejection", {
        cancelable: true,
      });
      Object.defineProperty(unexpectedRejection, "reason", {
        value: new Error("unexpected rejection"),
      });
      window.dispatchEvent(unexpectedRejection);
      expect(unexpectedRejection.defaultPrevented).toBe(false);

      // Firefox reports an unhandled expected rejection as an error event.
      const expectedError = new ErrorEvent("error", {
        cancelable: true,
        error,
      });
      window.dispatchEvent(expectedError);
      expect(expectedError.defaultPrevented).toBe(false);

      const unexpectedError = new ErrorEvent("error", {
        cancelable: true,
        error: new Error("unexpected error"),
      });
      window.dispatchEvent(unexpectedError);
      expect(unexpectedError.defaultPrevented).toBe(false);
    } finally {
      window.removeEventListener("cat:request-cancelled", recordCancellation);
      vi.unstubAllGlobals();
    }
  });

  it("publishes the exact navigation cancellation behind a Firefox error event", async () => {
    let rejectFetch: ((reason?: unknown) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((_resolve, reject) => {
            rejectFetch = reject;
          }),
      ),
    );
    const records: unknown[] = [];
    let navigationCancellation: unknown;
    const record = (event: Event): void => {
      records.push(Reflect.get(event, "detail"));
    };
    const recordNavigationCancellation = (event: Event): void => {
      navigationCancellation = Reflect.get(event, "detail");
    };
    window.addEventListener("cat:request-cancellation-error", record);
    window.addEventListener(
      "cat:request-cancelled",
      recordNavigationCancellation,
    );
    try {
      await import("./orpc.ts");
      const options = mocks.rpcLinkOptions;
      if (options === null) throw new Error("Missing RPC link options");
      const pending = options.fetch(
        new Request("http://cat.test/api/rpc/translation/onCreate", {
          headers: options.headers(),
        }),
        {},
      );
      window.dispatchEvent(new Event("pagehide"));
      rejectFetch?.(new Error("Firefox aborted navigation request"));
      const error = await pending.catch((reason: unknown) => reason);
      if (!(error instanceof Error))
        throw new Error("Expected cancellation error");
      expect(error.name).toBe("ExpectedRequestCancellationError");
      const expectedError = new ErrorEvent("error", {
        cancelable: true,
        error,
      });

      window.dispatchEvent(expectedError);

      expect(expectedError.defaultPrevented).toBe(true);
      expect(records).toHaveLength(1);
      expect(Reflect.get(records[0] as object, "error")).toBe(error);
      expect(Reflect.get(records[0] as object, "cancellation")).toBe(
        navigationCancellation,
      );
      expect(
        Reflect.get(Reflect.get(records[0] as object, "cancellation"), "kind"),
      ).toBe("navigation");
    } finally {
      window.removeEventListener("cat:request-cancellation-error", record);
      window.removeEventListener(
        "cat:request-cancelled",
        recordNavigationCancellation,
      );
      vi.unstubAllGlobals();
    }
  });

  it("publishes one cancellation record when Firefox reports one Error twice", async () => {
    let rejectFetch: ((reason?: unknown) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((_resolve, reject) => {
            rejectFetch = reject;
          }),
      ),
    );
    const records: unknown[] = [];
    const record = (event: Event): void => {
      records.push(Reflect.get(event, "detail"));
    };
    window.addEventListener("cat:request-cancellation-error", record);
    try {
      await import("./orpc.ts");
      const options = mocks.rpcLinkOptions;
      if (options === null) throw new Error("Missing RPC link options");
      const pending = options.fetch(
        new Request("http://cat.test/api/rpc/translation/onCreate", {
          headers: options.headers(),
        }),
        {},
      );
      window.dispatchEvent(new Event("pagehide"));
      rejectFetch?.(new Error("Firefox aborted navigation request"));
      const error = await pending.catch((reason: unknown) => reason);
      if (!(error instanceof Error))
        throw new Error("Expected cancellation error");
      const rejection = new Event("unhandledrejection", { cancelable: true });
      Object.defineProperty(rejection, "reason", { value: error });
      const errorEvent = new ErrorEvent("error", { cancelable: true, error });

      window.dispatchEvent(rejection);
      window.dispatchEvent(errorEvent);

      expect(rejection.defaultPrevented).toBe(true);
      expect(errorEvent.defaultPrevented).toBe(true);
      expect(records).toHaveLength(1);
      expect(Reflect.get(records[0] as object, "error")).toBe(error);
    } finally {
      window.removeEventListener("cat:request-cancellation-error", record);
      vi.unstubAllGlobals();
    }
  });

  it("does not create a global navigation marker when a BFCache document resumes", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    try {
      await import("./orpc.ts");
      const options = mocks.rpcLinkOptions;
      if (options === null) throw new Error("Missing RPC link options");
      const pending = options.fetch(
        new Request("http://cat.test/api/rpc/translation/getAll", {
          headers: options.headers(),
        }),
        {},
      );

      window.dispatchEvent(new Event("pagehide"));
      window.dispatchEvent(new Event("pageshow"));

      resolveFetch?.(new Response(null, { status: 204 }));
      await pending;
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not reset a global navigation marker when an unload is cancelled", async () => {
    try {
      await import("./orpc.ts");

      window.dispatchEvent(new Event("beforeunload"));

      expect(true).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("converts a navigation-cancelled response decoder failure only for its request ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"partial":')),
    );
    try {
      await import("./orpc.ts");
      const options = mocks.rpcLinkOptions;
      if (options === null) throw new Error("Missing RPC link options");
      const request = new Request(
        "http://cat.test/api/rpc/translation/getAll",
        {
          headers: options.headers(),
        },
      );
      const response = await options.fetch(request, {});

      window.dispatchEvent(new Event("pagehide"));

      await expect(response.json()).rejects.toMatchObject({
        name: "ExpectedRequestCancellationError",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps an active malformed response decoder failure observable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"partial":')),
    );
    try {
      await import("./orpc.ts");
      const options = mocks.rpcLinkOptions;
      if (options === null) throw new Error("Missing RPC link options");
      const response = await options.fetch(
        new Request("http://cat.test/api/rpc/translation/getAll", {
          headers: options.headers(),
        }),
        {},
      );

      await expect(response.json()).rejects.not.toMatchObject({
        name: "ExpectedRequestCancellationError",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("closes a source failure after an expected signal cancellation without unhandled rejection", async () => {
    let streamController:
      | ReadableStreamDefaultController<Uint8Array>
      | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(stream)),
    );
    const cancellations: unknown[] = [];
    const recordCancellation = (event: Event): void => {
      cancellations.push(Reflect.get(event, "detail"));
    };
    const unhandledRejections: unknown[] = [];
    const recordUnhandledRejection = (event: PromiseRejectionEvent): void => {
      unhandledRejections.push(event.reason);
    };
    window.addEventListener("cat:request-cancelled", recordCancellation);
    window.addEventListener("unhandledrejection", recordUnhandledRejection);
    try {
      await import("./orpc.ts");
      const controller = new AbortController();
      const options = mocks.rpcLinkOptions;
      if (options === null) throw new Error("Missing RPC link options");
      const response = await options.fetch(
        new Request("http://cat.test/api/rpc/memory/onNew", {
          headers: options.headers(),
          signal: controller.signal,
        }),
        {},
      );
      const reader = response.body?.getReader();
      if (reader === undefined) throw new Error("Missing response body reader");
      const read = reader.read();

      controller.abort();
      streamController?.error(new Error("SSE connection aborted"));

      await expect(read).resolves.toEqual({ done: true, value: undefined });
      expect(unhandledRejections).toEqual([]);
      expect(cancellations).toContainEqual(
        expect.objectContaining({ expected: true, kind: "signal" }),
      );
      window.dispatchEvent(new Event("pagehide"));
      expect(cancellations).toHaveLength(1);
    } finally {
      window.removeEventListener("cat:request-cancelled", recordCancellation);
      window.removeEventListener(
        "unhandledrejection",
        recordUnhandledRejection,
      );
      vi.unstubAllGlobals();
    }
  });

  it("marks an explicit SSE consumer cancellation before cancelling its source", async () => {
    const sourceFailure = new Error("source cancel rejected");
    const reason = new Error("consumer stopped reading");
    let sourceCancelReason: unknown;
    const stream = new ReadableStream<Uint8Array>({
      cancel(cancelReason) {
        sourceCancelReason = cancelReason;
        throw sourceFailure;
      },
    });
    const fetchMock = vi.fn<(request: Request) => Promise<Response>>(
      async () => new Response(stream),
    );
    vi.stubGlobal("fetch", fetchMock);
    const cancellations: unknown[] = [];
    const recordCancellation = (event: Event): void => {
      cancellations.push(Reflect.get(event, "detail"));
    };
    window.addEventListener("cat:request-cancelled", recordCancellation);
    try {
      await import("./orpc.ts");
      const options = mocks.rpcLinkOptions;
      if (options === null) throw new Error("Missing RPC link options");
      const request = new Request("http://cat.test/api/rpc/memory/onNew", {
        headers: options.headers(),
      });
      const response = await options.fetch(request, {});
      const reader = response.body?.getReader();
      if (reader === undefined) throw new Error("Missing response body reader");
      const instrumentedRequest = fetchMock.mock.calls[0]?.[0];
      if (!(instrumentedRequest instanceof Request))
        throw new Error("RPC fetch did not receive a Request");

      await expect(reader.cancel(reason)).resolves.toBeUndefined();
      expect(sourceCancelReason).toBe(reason);
      expect(cancellations).toEqual([
        expect.objectContaining({
          expected: true,
          id: instrumentedRequest.headers.get("x-cat-request-id"),
          kind: "consumer",
          url: instrumentedRequest.url,
          version: 1,
        }),
      ]);

      window.dispatchEvent(new Event("pagehide"));
      expect(cancellations).toHaveLength(1);
    } finally {
      window.removeEventListener("cat:request-cancelled", recordCancellation);
      vi.unstubAllGlobals();
    }
  });

  it("suppresses only same-ID adapter errors while a consumer cancellation owns the response", async () => {
    let finishSourceCancellation: (() => void) | undefined;
    const stream = new ReadableStream<Uint8Array>({
      cancel: () =>
        new Promise<void>((resolve) => {
          finishSourceCancellation = resolve;
        }),
    });
    const fetchMock = vi.fn<(request: Request) => Promise<Response>>(
      async () => new Response(stream),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      await import("./orpc.ts");
      const options = mocks.rpcLinkOptions;
      if (options === null) throw new Error("Missing RPC link options");
      const response = await options.fetch(
        new Request("http://cat.test/api/rpc/memory/onNew", {
          headers: options.headers(),
        }),
        {},
      );
      const reader = response.body?.getReader();
      if (reader === undefined) throw new Error("Missing response body reader");
      const instrumentedRequest = fetchMock.mock.calls[0]?.[0];
      if (!(instrumentedRequest instanceof Request))
        throw new Error("RPC fetch did not receive a Request");

      const cancellation = reader.cancel();
      await vi.waitFor(() =>
        expect(finishSourceCancellation).toBeTypeOf("function"),
      );
      mocks.errorHandler?.(new Error("consumer parser race"), {
        request: instrumentedRequest,
      });
      expect(mocks.logError).not.toHaveBeenCalled();
      mocks.errorHandler?.(new Error("consumer parser race"), {
        request: new Request(instrumentedRequest, {
          headers: { "x-cat-request-id": "wrong-request-id" },
        }),
      });
      expect(mocks.logError).toHaveBeenCalledOnce();

      finishSourceCancellation?.();
      await expect(cancellation).resolves.toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps a consumer cancellation race out of pending reads and unhandled rejections", async () => {
    const sourceCancelFailure = new Error("source cancel rejected");
    const sourceReadFailure = new Error("source read rejected");
    let rejectSourceRead: ((error: unknown) => void) | undefined;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull: () =>
          new Promise<void>((_resolve, reject) => {
            rejectSourceRead = reject;
          }),
        cancel: () => Promise.reject(sourceCancelFailure),
      },
      { highWaterMark: 0 },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(stream)),
    );
    const unhandled: unknown[] = [];
    const recordUnhandled = (event: Event): void => {
      unhandled.push(Reflect.get(event, "reason"));
    };
    window.addEventListener("unhandledrejection", recordUnhandled);
    try {
      await import("./orpc.ts");
      const options = mocks.rpcLinkOptions;
      if (options === null) throw new Error("Missing RPC link options");
      const response = await options.fetch(
        new Request("http://cat.test/api/rpc/memory/onNew", {
          headers: options.headers(),
        }),
        {},
      );
      const reader = response.body?.getReader();
      if (reader === undefined) throw new Error("Missing response body reader");
      const pendingRead = reader.read();
      await vi.waitFor(() => expect(rejectSourceRead).toBeTypeOf("function"));

      const cancellation = reader.cancel();
      rejectSourceRead?.(sourceReadFailure);

      await expect(pendingRead).resolves.toEqual({
        done: true,
        value: undefined,
      });
      await expect(cancellation).resolves.toBeUndefined();
      expect(unhandled).toEqual([]);
    } finally {
      window.removeEventListener("unhandledrejection", recordUnhandled);
      vi.unstubAllGlobals();
    }
  });

  it("keeps an unassociated SSE body error observable", async () => {
    const failure = new Error("malformed SSE frame");
    let streamController:
      | ReadableStreamDefaultController<Uint8Array>
      | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                streamController = controller;
              },
            }),
          ),
      ),
    );
    const cancellations: unknown[] = [];
    const recordCancellation = (event: Event): void => {
      cancellations.push(Reflect.get(event, "detail"));
    };
    window.addEventListener("cat:request-cancelled", recordCancellation);
    try {
      await import("./orpc.ts");
      const options = mocks.rpcLinkOptions;
      if (options === null) throw new Error("Missing RPC link options");
      const response = await options.fetch(
        new Request("http://cat.test/api/rpc/memory/onNew", {
          headers: options.headers(),
        }),
        {},
      );
      const reader = response.body?.getReader();
      if (reader === undefined) throw new Error("Missing response body reader");
      const read = reader.read();
      streamController?.error(failure);

      await expect(read).rejects.toBe(failure);
      expect(cancellations).toEqual([]);
    } finally {
      window.removeEventListener("cat:request-cancelled", recordCancellation);
      vi.unstubAllGlobals();
    }
  });

  it("does not read an SSE source before its consumer pulls", async () => {
    let pulls = 0;
    const upstream = new Response(null);
    Object.defineProperty(upstream, "body", {
      value: new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            pulls += 1;
            controller.enqueue(new TextEncoder().encode("event: ok\n\n"));
            controller.close();
          },
        },
        { highWaterMark: 0 },
      ),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => upstream),
    );
    try {
      await import("./orpc.ts");
      const options = mocks.rpcLinkOptions;
      if (options === null) throw new Error("Missing RPC link options");
      const response = await options.fetch(
        new Request("http://cat.test/api/rpc/memory/onNew", {
          headers: options.headers(),
        }),
        {},
      );
      const reader = response.body?.getReader();
      if (reader === undefined) throw new Error("Missing response body reader");

      expect(pulls).toBe(0);
      await expect(reader.read()).resolves.toMatchObject({ done: false });
      expect(pulls).toBe(1);
      await expect(reader.read()).resolves.toEqual({
        done: true,
        value: undefined,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("preserves Response bytes, null-body settlement, and clone body branches", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const response = new Response(body, {
      headers: { "x-cat-test": "preserved" },
      status: 202,
      statusText: "Accepted",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response),
    );
    try {
      await import("./orpc.ts");
      const options = mocks.rpcLinkOptions;
      if (options === null) throw new Error("Missing RPC link options");
      const wrapped = await options.fetch(
        new Request("http://cat.test/api/rpc/memory/onNew", {
          headers: options.headers(),
        }),
        {},
      );
      const clone = wrapped.clone();
      expect(wrapped).toMatchObject({ status: 202, statusText: "Accepted" });
      expect(wrapped.headers.get("x-cat-test")).toBe("preserved");
      const bytesMethod = Reflect.get(wrapped, "bytes");
      expect(bytesMethod).toBeTypeOf("function");
      const result = await Reflect.apply(bytesMethod, wrapped, []);
      expect(result).toEqual(bytes);
      const cloneReader = clone.body?.getReader();
      if (cloneReader === undefined)
        throw new Error("Missing cloned body reader");
      await expect(cloneReader.read()).resolves.toMatchObject({
        done: false,
        value: bytes,
      });
      await expect(cloneReader.read()).resolves.toEqual({
        done: true,
        value: undefined,
      });

      const nullController = new AbortController();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(null, { status: 204 })),
      );
      const nullResponse = await options.fetch(
        new Request("http://cat.test/api/rpc/memory/onNew", {
          headers: options.headers(),
          signal: nullController.signal,
        }),
        {},
      );
      expect(nullResponse.body).toBeNull();
      nullController.abort();
      await expect(nullResponse.text()).resolves.toBe("");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
