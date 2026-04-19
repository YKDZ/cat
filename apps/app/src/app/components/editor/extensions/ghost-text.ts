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
        const typed = tr.state.doc
          .toString()
          .slice(state.anchorPosition, cursorPos);
        const remaining = state.suggestion.startsWith(typed)
          ? state.suggestion.slice(typed.length)
          : null;

        if (!remaining) {
          return { suggestion: null, anchorPosition: 0 };
        }

        // Anchor the remaining suggestion at the current (post-insertion) cursor
        return { suggestion: remaining, anchorPosition: cursorPos };
      }
    }

    // Document changes do not clear suggestion — buildDecorations controls
    // visibility via prefix matching. This allows ghost text to reappear
    // when the user deletes text to restore a prefix match.

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

      const cursorPos = view.state.selection.main.head;
      // Only show if cursor is at or past the anchor
      if (cursorPos < state.anchorPosition) return Decoration.none;

      // Remaining suggestion = full suggestion minus what was already typed
      const typed = view.state.doc
        .toString()
        .slice(state.anchorPosition, cursorPos);
      const remaining = state.suggestion.startsWith(typed)
        ? state.suggestion.slice(typed.length)
        : null;

      if (!remaining) return Decoration.none;

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
      const state = view.state.field(ghostTextStateField);
      if (!state.suggestion) return false;

      const cursorPos = view.state.selection.main.head;
      const typed = view.state.doc
        .toString()
        .slice(state.anchorPosition, cursorPos);
      const remaining = state.suggestion.startsWith(typed)
        ? state.suggestion.slice(typed.length)
        : null;

      if (!remaining) {
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
      // Accept one word from ghost text and move cursor
      const handled = (() => {
        const state = view.state.field(ghostTextStateField);
        if (!state.suggestion) return false;

        const cursorPos = view.state.selection.main.head;
        const typed = view.state.doc
          .toString()
          .slice(state.anchorPosition, cursorPos);
        const remaining = state.suggestion.startsWith(typed)
          ? state.suggestion.slice(typed.length)
          : null;

        if (!remaining) {
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
