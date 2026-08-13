import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const streams = vi.hoisted((): AsyncGenerator<unknown>[] => []);

vi.mock("#/rpc/orpc.ts", () => ({
  orpc: {
    glossary: {
      findTerm: vi.fn(async () => {
        const stream = streams.shift();
        if (!stream) throw new Error("Missing mocked term recall stream.");
        return stream;
      }),
    },
  },
}));
vi.mock("#/stores/editor/table.ts", () => ({
  useEditorTableStore: () => ({
    elementId: ref(1),
    elementLanguageId: ref("en"),
  }),
}));
vi.mock("#/stores/editor/context.ts", () => ({
  useEditorContextStore: () => ({
    languageToId: ref("zh-Hans"),
    projectId: ref("11111111-1111-4111-8111-111111111111"),
  }),
}));
vi.mock("#/stores/profile.ts", () => ({
  useProfileStore: () => ({ editorTermMinConfidence: ref([0.6]) }),
}));

import { useEditorTermStore } from "./term.ts";

const candidate = (term: string, translation: string, conceptId: number) => ({
  type: "CANDIDATE" as const,
  candidate: {
    term,
    translation,
    definition: null,
    conceptId,
    glossaryId: "11111111-1111-4111-8111-111111111111",
    confidence: 1,
    evidences: [{ channel: "exact" as const, confidence: 1 }],
  },
});

const completed = (term: string, translation: string, conceptId: number) => ({
  type: "COMPLETED" as const,
  result: {
    requestedChannels: ["EXACT"],
    outcomes: {
      EXACT: {
        status: "SUCCEEDED" as const,
        candidates: [candidate(term, translation, conceptId).candidate],
      },
      FUZZY: { status: "SKIPPED" as const, reason: "NOT_REQUESTED" as const },
      KEYWORD: {
        status: "SKIPPED" as const,
        reason: "NOT_REQUESTED" as const,
      },
      VARIANT: {
        status: "SKIPPED" as const,
        reason: "NOT_REQUESTED" as const,
      },
      SEMANTIC: {
        status: "SKIPPED" as const,
        reason: "NOT_REQUESTED" as const,
      },
    },
  },
});

const controlledStream = () => {
  const events: unknown[] = [];
  let closed = false;
  let notify: (() => void) | undefined;
  let waitCount = 0;

  const wake = () => {
    const resolve = notify;
    notify = undefined;
    resolve?.();
  };
  const wait = async () => {
    waitCount += 1;
    await new Promise<void>((resolve) => {
      notify = resolve;
    });
  };
  const stream = (async function* (): AsyncGenerator<unknown> {
    while (true) {
      while (events.length > 0) {
        const event = events.shift();
        if (event !== undefined) yield event;
      }
      if (closed) return;
      await wait();
    }
  })();

  return {
    stream,
    emit: (event: unknown) => {
      events.push(event);
      wake();
    },
    close: () => {
      closed = true;
      wake();
    },
    waitForWaitCount: async (count: number) => {
      await vi.waitFor(() => {
        expect(waitCount).toBeGreaterThanOrEqual(count);
      });
    },
  };
};

describe("editor term store", () => {
  beforeEach(() => {
    streams.length = 0;
    setActivePinia(createPinia());
  });

  it("does not let an old completed stream overwrite the active request", async () => {
    const old = controlledStream();
    const current = controlledStream();
    streams.push(old.stream, current.stream);
    const store = useEditorTermStore();

    const oldRequest = store.updateTerms();
    await old.waitForWaitCount(1);

    const currentRequest = store.updateTerms();
    await current.waitForWaitCount(1);

    current.emit(candidate("new", "新", 2));
    await current.waitForWaitCount(2);

    old.emit(candidate("old", "旧", 1));
    old.emit(completed("old", "旧", 1));
    old.close();
    current.emit(completed("new", "新", 2));
    current.close();

    await expect(Promise.all([oldRequest, currentRequest])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(store.terms.map((term) => term.term)).toEqual(["new"]);
    expect(store.recallResult?.outcomes.EXACT).toMatchObject({
      status: "SUCCEEDED",
      candidates: [{ term: "new" }],
    });
    expect(store.error).toBeNull();
  });
});
