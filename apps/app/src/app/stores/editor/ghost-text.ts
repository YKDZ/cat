import { defineStore, storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";

import { orpc } from "@/app/rpc/orpc";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorMemoryStore } from "@/app/stores/editor/memory.ts";
import { useEditorSuggestionStore } from "@/app/stores/editor/suggestion.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useProfileStore } from "@/app/stores/profile.ts";

// ─── Ghost Text Source Types ───

type GhostTextSource =
  | "pre-translate"
  | "memory-fallback"
  | "suggestion-fallback";

// ─── Store ───

export const useEditorGhostTextStore = defineStore("editorGhostText", () => {
  const tableStore = useEditorTableStore();
  const { elementId, translationValue } = storeToRefs(tableStore);

  const { languageToId } = storeToRefs(useEditorContextStore());
  const { memories } = storeToRefs(useEditorMemoryStore());
  const { suggestions } = storeToRefs(useEditorSuggestionStore());

  const {
    ghostTextEnabled,
    ghostTextFallbackStrategy,
    editorMemoryMinConfidence,
  } = storeToRefs(useProfileStore());

  // ── State ──────────────────────────────────────────────────────────────
  const suggestion = ref<string | null>(null);
  const anchorPosition = ref(0);
  const source = ref<GhostTextSource>("pre-translate");
  const isPending = ref(false);

  let abortController: AbortController | null = null;

  /** Active fallback cleanup — cancels watchers and timers */
  let cleanupFallback: (() => void) | null = null;

  /**
   * When set to true, the next `watch(translationValue)` cycle will skip
   * clearSuggestion() — used when a Ctrl-ArrowRight word acceptance causes
   * the doc to change without the user abandoning the ghost text.
   */
  let suppressNextClearFlag = false;

  // ── Helpers ────────────────────────────────────────────────────────────

  const clearSuggestion = () => {
    suggestion.value = null;
    anchorPosition.value = 0;
    isPending.value = false;
  };

  const cancelPending = () => {
    isPending.value = false;
    abortController?.abort();
    abortController = null;
    // Cancel any active fallback watchers/timers
    cleanupFallback?.();
    cleanupFallback = null;
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

  /**
   * 接受当前 ghost text，将完整 suggestion 写入 translationValue。
   *
   * Accept the current ghost text — writes the full suggestion value into
   * translationValue, then clears ghost text state.
   */
  const acceptGhostText = () => {
    if (suggestion.value === null) return;
    suppressNextClearFlag = true;
    translationValue.value = suggestion.value;
    suggestion.value = null;
    anchorPosition.value = 0;
  };

  /**
   * Whether ghost text is visible (suggestion is set and current input is
   * a prefix of the suggestion).
   */
  const showGhost = computed(
    () =>
      suggestion.value !== null &&
      suggestion.value.startsWith(translationValue.value),
  );

  // ── Fallback Chain ─────────────────────────────────────────────────────

  /**
   * 从 memory store 获取第一条满足 confidence 阈值的候选。
   *
   * Get the first memory candidate meeting the minimum confidence threshold.
   */
  const getFirstMemoryCandidate = (): {
    text: string;
    confidence: number;
  } | null => {
    const minConf = editorMemoryMinConfidence.value[0] ?? 0.72;
    for (const m of memories.value) {
      if (m.confidence >= minConf) {
        return {
          text: m.adaptedTranslation ?? m.translation,
          confidence: m.confidence,
        };
      }
    }
    return null;
  };

  /**
   * 从 suggestion store 获取第一条候选。
   *
   * Get the first suggestion candidate.
   */
  const getFirstSuggestionCandidate = (): {
    text: string;
    confidence: number;
  } | null => {
    const s = suggestions.value[0];
    if (!s) return null;
    return { text: s.translation, confidence: s.confidence };
  };

  /**
   * Execute the fallback chain based on user's chosen strategy.
   * Uses check-then-watch pattern with a shared 2000ms timeout.
   */
  const executeFallback = (snapshotElementId: number) => {
    const strategy = ghostTextFallbackStrategy.value;

    if (strategy === "none") return;

    const TIMEOUT_MS = 2000;
    const cleanups: (() => void)[] = [];

    const setSuggestionIfValid = (text: string, src: GhostTextSource) => {
      // Verify element hasn't changed during fallback wait
      if (elementId.value !== snapshotElementId) return;
      suggestion.value = text;
      anchorPosition.value = 0;
      source.value = src;
      isPending.value = false;
      // Cleanup all watchers/timers on success
      for (const fn of cleanups) fn();
      cleanupFallback = null;
    };

    const handleTimeout = () => {
      // For best-confidence: use whatever is available
      if (strategy === "best-confidence") {
        const mem = getFirstMemoryCandidate();
        const sug = getFirstSuggestionCandidate();
        if (mem && sug) {
          setSuggestionIfValid(
            mem.confidence >= sug.confidence ? mem.text : sug.text,
            mem.confidence >= sug.confidence
              ? "memory-fallback"
              : "suggestion-fallback",
          );
        } else if (mem) {
          setSuggestionIfValid(mem.text, "memory-fallback");
        } else if (sug) {
          setSuggestionIfValid(sug.text, "suggestion-fallback");
        } else {
          isPending.value = false;
        }
      } else {
        isPending.value = false;
      }
      for (const fn of cleanups) fn();
      cleanupFallback = null;
    };

    const timer = setTimeout(handleTimeout, TIMEOUT_MS);
    cleanups.push(() => {
      clearTimeout(timer);
    });

    // Store cleanup function so cancelPending() can dispose everything
    cleanupFallback = () => {
      for (const fn of cleanups) fn();
    };

    if (strategy === "first-memory") {
      // Check immediate
      const immediate = getFirstMemoryCandidate();
      if (immediate) {
        clearTimeout(timer);
        setSuggestionIfValid(immediate.text, "memory-fallback");
        return;
      }
      // Watch for first qualifying memory
      const stop = watch(memories, () => {
        const candidate = getFirstMemoryCandidate();
        if (candidate) {
          setSuggestionIfValid(candidate.text, "memory-fallback");
        }
      });
      cleanups.push(stop);
    } else if (strategy === "first-suggestion") {
      // Check immediate
      const immediate = getFirstSuggestionCandidate();
      if (immediate) {
        clearTimeout(timer);
        setSuggestionIfValid(immediate.text, "suggestion-fallback");
        return;
      }
      // Watch for first suggestion
      const stop = watch(suggestions, () => {
        const candidate = getFirstSuggestionCandidate();
        if (candidate) {
          setSuggestionIfValid(candidate.text, "suggestion-fallback");
        }
      });
      cleanups.push(stop);
    } else if (strategy === "best-confidence") {
      // Track which sources have resolved
      let memoryResolved = false;
      let suggestionResolved = false;
      let memCandidate: { text: string; confidence: number } | null = null;
      let sugCandidate: { text: string; confidence: number } | null = null;

      const tryResolve = () => {
        if (!memoryResolved || !suggestionResolved) return;
        // Both resolved — pick best
        clearTimeout(timer);
        if (memCandidate && sugCandidate) {
          setSuggestionIfValid(
            memCandidate.confidence >= sugCandidate.confidence
              ? memCandidate.text
              : sugCandidate.text,
            memCandidate.confidence >= sugCandidate.confidence
              ? "memory-fallback"
              : "suggestion-fallback",
          );
        } else if (memCandidate) {
          setSuggestionIfValid(memCandidate.text, "memory-fallback");
        } else if (sugCandidate) {
          setSuggestionIfValid(sugCandidate.text, "suggestion-fallback");
        } else {
          isPending.value = false;
          for (const fn of cleanups) fn();
          cleanupFallback = null;
        }
      };

      // Check memory immediate
      memCandidate = getFirstMemoryCandidate();
      if (memCandidate) {
        memoryResolved = true;
      } else {
        const stop = watch(memories, () => {
          const c = getFirstMemoryCandidate();
          if (c) {
            memCandidate = c;
            memoryResolved = true;
            tryResolve();
          }
        });
        cleanups.push(stop);
      }

      // Check suggestion immediate
      sugCandidate = getFirstSuggestionCandidate();
      if (sugCandidate) {
        suggestionResolved = true;
      } else {
        const stop = watch(suggestions, () => {
          const c = getFirstSuggestionCandidate();
          if (c) {
            sugCandidate = c;
            suggestionResolved = true;
            tryResolve();
          }
        });
        cleanups.push(stop);
      }

      // Both already available
      if (memoryResolved && suggestionResolved) {
        tryResolve();
      }
    }
  };

  // ── Server request (enter-to-load) ─────────────────────────────────────

  const loadGhostText = async () => {
    if (!elementId.value || !languageToId.value) return;
    if (!ghostTextEnabled.value) return;

    const snapshotElementId = elementId.value;

    cancelPending();
    clearSuggestion();
    isPending.value = true;
    abortController = new AbortController();
    const { signal } = abortController;

    try {
      const stream = await orpc.ghostText.suggest(
        {
          elementId: elementId.value,
          languageId: languageToId.value,
          currentInput: "",
          cursorPosition: 0,
        },
        { signal },
      );

      // Verify element hasn't changed
      if (elementId.value !== snapshotElementId) return;

      let received = false;

      for await (const chunk of stream) {
        if (signal.aborted) break;
        if (elementId.value !== snapshotElementId) {
          suggestion.value = null;
          break;
        }
        if (!received) {
          suggestion.value = null;
          anchorPosition.value = 0;
          source.value = "pre-translate";
          received = true;
        }
        suggestion.value = (suggestion.value ?? "") + chunk.text;
      }

      if (received) {
        isPending.value = false;
        return;
      }

      // No result from API — execute frontend fallback
      if (elementId.value === snapshotElementId && !signal.aborted) {
        executeFallback(snapshotElementId);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      // API failed — try fallback
      if (elementId.value === snapshotElementId) {
        executeFallback(snapshotElementId);
      }
    }
  };

  // ── Watchers ───────────────────────────────────────────────────────────

  // Enter-to-load: when elementId changes, immediately load ghost text
  watch(elementId, (newId) => {
    cancelPending();
    clearSuggestion();
    if (newId) {
      void loadGhostText();
    }
  });

  // Skip clear when a Ctrl-ArrowRight word acceptance caused the doc change
  watch(translationValue, () => {
    if (suppressNextClearFlag) {
      suppressNextClearFlag = false;
    }
  });

  // Disable ghost text when toggle is off
  watch(ghostTextEnabled, (enabled) => {
    if (!enabled) {
      cancelPending();
      clearSuggestion();
    }
  });

  return {
    suggestion,
    anchorPosition,
    source,
    isPending,
    showGhost,
    clearSuggestion,
    advanceSuggestion,
    acceptGhostText,
  };
});
