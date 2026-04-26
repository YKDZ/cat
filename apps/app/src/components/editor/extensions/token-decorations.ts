import type { Token } from "@cat/plugin-core";
import type { Extension, Range } from "@codemirror/state";

import { StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

// ─── State Effect & Field ─────────────────────────────────────────────────────

export const setTokensEffect = StateEffect.define<Token[]>();

export const tokensField = StateField.define<Token[]>({
  create: () => [],
  update(state, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setTokensEffect)) return effect.value;
    }
    // 文档变更时清除 token（位置可能已失效）
    if (tr.docChanged) return [];
    return state;
  },
});

// ─── Flatten Tokens ───────────────────────────────────────────────────────────

const flattenTokens = (tokens: Token[]): Token[] => {
  const result: Token[] = [];
  for (const token of tokens) {
    if (token.children?.length) {
      result.push(...flattenTokens(token.children));
    } else {
      result.push(token);
    }
  }
  return result;
};

// ─── Token Type → CSS Class 映射 ─────────────────────────────────────────────

const tokenTypeToClass: Partial<Record<string, string>> = {
  term: "cm-token-term",
  number: "cm-token-number",
  variable: "cm-token-variable",
  link: "cm-token-link",
  mask: "cm-token-mask",
  unknown: "cm-token-unknown",
};

// ─── View Plugin ──────────────────────────────────────────────────────────────

const tokenDecorationsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.state.field(tokensField) !== update.startState.field(tokensField)
      ) {
        this.decorations = this.build(update.view);
      }
    }

    build(view: EditorView): DecorationSet {
      const tokens = view.state.field(tokensField);
      const flat = flattenTokens(tokens);
      const docLength = view.state.doc.length;

      const decorations: Range<Decoration>[] = [];

      for (const token of flat) {
        const cls = tokenTypeToClass[token.type];
        if (!cls) continue;
        // 只添加在文档长度范围内的装饰
        if (
          token.start < 0 ||
          token.end > docLength ||
          token.start >= token.end
        )
          continue;

        const attrs: Record<string, string> | undefined = token.meta
          ? { "data-meta": JSON.stringify(token.meta) }
          : undefined;

        decorations.push(
          Decoration.mark({ class: cls, attributes: attrs }).range(
            token.start,
            token.end,
          ),
        );
      }

      // Decoration.set 要求装饰按位置排序
      decorations.sort((a, b) => a.from - b.from);
      return Decoration.set(decorations, true);
    }
  },
  { decorations: (v) => v.decorations },
);

// ─── Theme ────────────────────────────────────────────────────────────────────

const tokenDecorationTheme = EditorView.baseTheme({
  ".cm-token-term": {
    color: "var(--cm-token-term-color, #9333ea)",
    textDecorationLine: "underline",
    textDecorationStyle: "wavy",
    textDecorationColor: "var(--cm-token-term-underline, #c084fc)",
    cursor: "help",
  },
  ".cm-token-number": {
    color: "var(--cm-token-number-color, #d97706)",
    fontFamily: "monospace",
    backgroundColor: "var(--cm-token-number-bg, rgba(217,119,6,0.1))",
    borderRadius: "2px",
  },
  ".cm-token-variable": {
    color: "var(--cm-token-variable-color, #2563eb)",
    fontFamily: "monospace",
    backgroundColor: "var(--cm-token-variable-bg, rgba(37,99,235,0.1))",
    borderRadius: "2px",
  },
  ".cm-token-link": {
    color: "var(--cm-token-link-color, #0284c7)",
    textDecoration: "underline",
    cursor: "pointer",
  },
  ".cm-token-mask": {
    color: "var(--cm-token-mask-color, #6b7280)",
    opacity: "0.8",
    backgroundColor: "var(--cm-token-mask-bg, rgba(107,114,128,0.1))",
    borderRadius: "2px",
  },
  ".cm-token-unknown": {
    color: "var(--cm-token-unknown-color, #ef4444)",
  },
});

// ─── Link Ctrl+Click 跳转 ─────────────────────────────────────────────────────

export const linkClickHandler = EditorView.domEventHandlers({
  click(event, view) {
    if (!event.ctrlKey && !event.metaKey) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;

    const tokens = view.state.field(tokensField);
    const flat = flattenTokens(tokens);
    const linkToken = flat.find(
      (t) => t.type === "link" && pos >= t.start && pos < t.end,
    );

    if (linkToken?.meta?.url && typeof linkToken.meta.url === "string") {
      window.open(linkToken.meta.url, "_blank", "noopener");
      return true;
    }
    return false;
  },
});

// ─── 导出统一扩展 ─────────────────────────────────────────────────────────────

export const tokenDecorationExtension = (): Extension[] => [
  tokensField,
  tokenDecorationsPlugin,
  tokenDecorationTheme,
];

export { flattenTokens };
