import { useDebounceFn } from "@vueuse/core";
import { defineStore, storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";

import { orpc } from "@/app/rpc/orpc";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorMemoryStore } from "@/app/stores/editor/memory.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorTermStore } from "@/app/stores/editor/term.ts";
import { useProfileStore } from "@/app/stores/profile.ts";

// ─── Ghost Text Source Types ───

type GhostTextSource = "memory" | "server_agent";

// ─── Store ───

export const useEditorGhostTextStore = defineStore("editorGhostText", () => {
  const tableStore = useEditorTableStore();
  const { elementId, translationValue, editorView } = storeToRefs(tableStore);

  const { languageToId } = storeToRefs(useEditorContextStore());
  const { memories } = storeToRefs(useEditorMemoryStore());
  const { terms } = storeToRefs(useEditorTermStore());

  const { ghostTextEnabled, ghostTextDebounceMs } =
    storeToRefs(useProfileStore());

  // ── State ──────────────────────────────────────────────────────────────
  const suggestion = ref<string | null>(null);
  const anchorPosition = ref(0);
  const source = ref<GhostTextSource>("memory");
  const isPending = ref(false);

  let abortController: AbortController | null = null;

  /**
   * When set to true, the next `watch(translationValue)` cycle will skip
   * clearSuggestion() — used when a Ctrl-ArrowRight word acceptance causes
   * the doc to change without the user abandoning the ghost text.
   */
  let suppressNextClearFlag = false;

  // ── Helpers ────────────────────────────────────────────────────────────

  const getCursorPosition = () =>
    editorView.value?.state.selection.main.head ?? 0;

  const clearSuggestion = () => {
    suggestion.value = null;
    anchorPosition.value = 0;
    isPending.value = false;
  };

  const cancelPending = () => {
    isPending.value = false;
    abortController?.abort();
    abortController = null;
  };

  /**
   * Called by TranslationEditor when Ctrl-ArrowRight accepts one ghost text
   * word.  Updates the store to reflect the remaining suggestion so that the
   * subsequent translationValue watcher does not fire clearSuggestion().
   */
  const advanceSuggestion = (remaining: string | null, newAnchor: number) => {
    suppressNextClearFlag = true;
    suggestion.value = remaining;
    anchorPosition.value = newAnchor;
  };

  /** Collect hints already cached in the frontend to avoid extra DB queries */
  const collectCachedContext = () => {
    const memoryHints =
      memories.value.length > 0
        ? memories.value
            .slice(0, 3)
            .map((m) => `[${m.confidence.toFixed(2)}] ${m.translation}`)
            .join("\n")
        : undefined;

    const termHints =
      terms.value.length > 0
        ? terms.value
            .slice(0, 5)
            .map((tm) => `${tm.term} → ${tm.translation}`)
            .join("\n")
        : undefined;

    return { memoryHints, termHints };
  };

  // ── Server request ─────────────────────────────────────────────────────

  const requestFromServer = async () => {
    if (!elementId.value || !languageToId.value) return;

    const cursorPos = getCursorPosition();
    const currentInput = translationValue.value.slice(0, cursorPos);

    // Snapshot editor state at request time for stale-response detection.
    const snapshotInput = currentInput;
    const snapshotElementId = elementId.value;

    cancelPending();
    isPending.value = true;
    abortController = new AbortController();
    // Capture signal in a local variable so the loop always checks the signal
    // belonging to THIS request, not whatever abortController points to after
    // a subsequent cancelPending() call replaces the shared reference.
    const { signal } = abortController;

    const hints = collectCachedContext();

    try {
      const stream = await orpc.ghostText.suggest(
        {
          elementId: elementId.value,
          languageId: languageToId.value,
          currentInput,
          cursorPosition: cursorPos,
          ...hints,
        },
        { signal },
      );

      // Before starting to apply chunks, verify the editor hasn't changed
      // since the request was fired (e.g. user typed while request was in-flight).
      if (
        elementId.value !== snapshotElementId ||
        translationValue.value.slice(0, getCursorPosition()) !== snapshotInput
      ) {
        return;
      }

      // Reset suggestion at the anchor position
      suggestion.value = null;
      anchorPosition.value = cursorPos;
      source.value = "server_agent";

      for await (const chunk of stream) {
        if (signal.aborted) break;
        // Re-validate on every chunk — state may change mid-stream.
        if (
          elementId.value !== snapshotElementId ||
          translationValue.value.slice(0, getCursorPosition()) !== snapshotInput
        ) {
          suggestion.value = null;
          break;
        }
        suggestion.value = (suggestion.value ?? "") + chunk.text;
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      // Silently discard errors for ghost text — non-critical feature
    } finally {
      isPending.value = false;
    }
  };

  // ── Debounced trigger ──────────────────────────────────────────────────

  const debouncedRequest = useDebounceFn(
    () => {
      void requestFromServer();
    },
    computed(() => ghostTextDebounceMs.value),
  );

  const triggerManual = () => {
    void requestFromServer();
  };

  // ── Watchers ───────────────────────────────────────────────────────────

  // Auto-trigger on translationValue change
  watch(translationValue, (newVal) => {
    if (!ghostTextEnabled.value) return;
    if (!elementId.value) return;

    // If translation memory already set a suggestion, don't override with
    // a debounced server request while input is still empty.
    if (newVal.length === 0) return;

    // Only trigger ghost text when the cursor is at the very end of the
    // document — mid-text edits are corrections, not continuations.
    const cursorPos = getCursorPosition();
    if (cursorPos < newVal.length) return;

    // Skip clear when a Ctrl-ArrowRight word acceptance caused the doc change
    if (suppressNextClearFlag) {
      suppressNextClearFlag = false;
      return;
    }

    // Cancel any existing suggestion before debouncing a new request
    cancelPending();
    clearSuggestion();
    void debouncedRequest();
  });

  // Clear on element change
  watch(elementId, () => {
    cancelPending();
    clearSuggestion();
  });

  return {
    suggestion,
    anchorPosition,
    source,
    isPending,
    clearSuggestion,
    advanceSuggestion,
    triggerManual,
  };
});
