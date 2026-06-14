import { StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { keymap } from "@codemirror/view";

// ─── State Types ───

type GhostTextState = {
  /** The continuation text to display (from cursor position onward) */
  suggestion: string | null;
  /** The cursor position at which the suggestion was anchored */
  anchorPosition: number;
};

/**
 * Compute the remaining ghost text suffix for the current document and cursor.
 *
 * @param state - Current ghost text state
 * @param doc - Current editor document text
 * @param cursorPos - Current cursor position
 * @returns - Remaining visible suffix, or null when it does not match
 */
export const getGhostTextRemainder = (
  state: GhostTextState,
  doc: string,
  cursorPos: number,
): string | null => {
  if (state.suggestion === null) return null;
  if (cursorPos < state.anchorPosition) return null;

  const typed = doc.slice(state.anchorPosition, cursorPos);
  if (!state.suggestion.startsWith(typed)) return null;

  const remaining = state.suggestion.slice(typed.length);
  return remaining.length > 0 ? remaining : null;
};

/**
 * Determine whether ghost text shortcuts should handle the key, skipping IME composition.
 *
 * @param view - Composition state from the CodeMirror view
 * @returns - True when the editor is not composing
 */
export const shouldHandleGhostTextKey = (
  view: Pick<EditorView, "composing">,
): boolean => !view.composing;

// ─── State Effects ───

/** Set a new ghost text suggestion */
export const setGhostTextEffect = StateEffect.define<GhostTextState>();

/** Clear the current ghost text suggestion */
// oxlint-disable-next-line no-unnecessary-type-arguments
export const clearGhostTextEffect = StateEffect.define<null>();

/** Accept one word of the current ghost text suggestion */
// oxlint-disable-next-line no-unnecessary-type-arguments
export const acceptWordGhostTextEffect = StateEffect.define<null>();

// ─── State Field ───

export const ghostTextStateField = StateField.define<GhostTextState>({
  create: () => ({ suggestion: null, anchorPosition: 0 }),

  update: (state, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setGhostTextEffect)) {
        return effect.value;
      }
      if (effect.is(clearGhostTextEffect)) {
        return { suggestion: null, anchorPosition: 0 };
      }
      if (effect.is(acceptWordGhostTextEffect)) {
        // tr.state is already the post-insertion state:
        // - tr.state.doc includes the just-accepted word
        // - tr.state.selection.main.head is the new cursor position
        // So `typed` covers the accepted word, and `remaining` is what's left.
        if (state.suggestion === null) {
          return state;
        }
        const cursorPos = tr.state.selection.main.head;
        const remaining = getGhostTextRemainder(
          state,
          tr.state.doc.toString(),
          cursorPos,
        );

        if (remaining === null) {
          return { suggestion: null, anchorPosition: 0 };
        }

        // Anchor the remaining suggestion at the current (post-insertion) cursor
        return { suggestion: remaining, anchorPosition: cursorPos };
      }
    }

    if (tr.docChanged && state.suggestion !== null) {
      const cursorPos = tr.state.selection.main.head;
      const remaining = getGhostTextRemainder(
        state,
        tr.state.doc.toString(),
        cursorPos,
      );
      if (remaining === null) return { suggestion: null, anchorPosition: 0 };
    }

    return state;
  },
});

// ─── Widget ───

class GhostTextWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  override eq(other: GhostTextWidget): boolean {
    return other.text === this.text;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-ghost-text";
    span.textContent = this.text;
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

// ─── View Plugin (Decorations) ───

const ghostTextDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      this.decorations = this.buildDecorations(update.view);
    }

    buildDecorations(view: EditorView): DecorationSet {
      const state = view.state.field(ghostTextStateField);
      if (!state.suggestion) return Decoration.none;
      if (!view.state.selection.main.empty) return Decoration.none;

      const cursorPos = view.state.selection.main.head;
      const remaining = getGhostTextRemainder(
        state,
        view.state.doc.toString(),
        cursorPos,
      );

      if (remaining === null) return Decoration.none;

      const deco = Decoration.widget({
        widget: new GhostTextWidget(remaining),
        side: 1,
      });

      return Decoration.set([deco.range(cursorPos)]);
    }
  },
  { decorations: (v) => v.decorations },
);

// ─── Keymap ───

const ghostTextKeymap = keymap.of([
  {
    key: "Tab",
    run: (view) => {
      if (!shouldHandleGhostTextKey(view)) return false;

      const state = view.state.field(ghostTextStateField);
      if (!state.suggestion) return false;

      const cursorPos = view.state.selection.main.head;
      const remaining = getGhostTextRemainder(
        state,
        view.state.doc.toString(),
        cursorPos,
      );

      if (remaining === null) {
        view.dispatch({ effects: clearGhostTextEffect.of(null) });
        return false;
      }

      // Insert remaining suggestion text at cursor
      view.dispatch({
        changes: { from: cursorPos, insert: remaining },
        selection: { anchor: cursorPos + remaining.length },
        effects: clearGhostTextEffect.of(null),
      });
      return true;
    },
  },
  {
    key: "Ctrl-ArrowRight",
    run: (view) => {
      if (!shouldHandleGhostTextKey(view)) return false;

      // Accept one word from ghost text and move cursor
      const handled = (() => {
        const state = view.state.field(ghostTextStateField);
        if (!state.suggestion) return false;

        const cursorPos = view.state.selection.main.head;
        const remaining = getGhostTextRemainder(
          state,
          view.state.doc.toString(),
          cursorPos,
        );

        if (remaining === null) {
          view.dispatch({ effects: clearGhostTextEffect.of(null) });
          return false;
        }

        const wordBoundary = remaining.search(/\s/);
        const wordToInsert =
          wordBoundary === -1
            ? remaining
            : remaining.slice(0, wordBoundary + 1); // include the space

        const newCursorPos = cursorPos + wordToInsert.length;

        view.dispatch({
          changes: { from: cursorPos, insert: wordToInsert },
          selection: { anchor: newCursorPos },
          effects: acceptWordGhostTextEffect.of(null),
        });
        return true;
      })();

      return handled;
    },
  },
  {
    key: "Escape",
    run: (view) => {
      if (!shouldHandleGhostTextKey(view)) return false;

      const state = view.state.field(ghostTextStateField);
      if (!state.suggestion) return false;
      view.dispatch({ effects: clearGhostTextEffect.of(null) });
      return true;
    },
  },
]);

// ─── Theme ───

const ghostTextTheme = EditorView.baseTheme({
  ".cm-ghost-text": {
    color: "var(--cm-ghost-text-color, rgba(100,100,100,0.5))",
    pointerEvents: "none",
    userSelect: "none",
  },
});

// ─── Extension Bundle ───

export const ghostTextExtension = [
  ghostTextStateField,
  ghostTextDecorations,
  ghostTextKeymap,
  ghostTextTheme,
];
