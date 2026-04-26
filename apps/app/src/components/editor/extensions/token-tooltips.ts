import { EditorView, hoverTooltip } from "@codemirror/view";

import { flattenTokens, tokensField } from "./token-decorations";

// ─── Term Tooltip ─────────────────────────────────────────────────────────────

export const tokenTooltipExtension = hoverTooltip((view, pos) => {
  const tokens = view.state.field(tokensField);
  const flat = flattenTokens(tokens);
  const hovered = flat.find((t) => pos >= t.start && pos < t.end);

  if (!hovered) return null;

  if (hovered.type === "term" && hovered.meta) {
    const { term, translation, definition } = hovered.meta as {
      term?: string;
      translation?: string;
      definition?: string | null;
    };

    return {
      pos: hovered.start,
      end: hovered.end,
      above: true,
      create() {
        const dom = document.createElement("div");
        dom.className = "cm-token-tooltip-term";

        const termLine = document.createElement("div");
        termLine.className = "cm-token-tooltip-row";
        const termLabel = document.createElement("span");
        termLabel.className = "cm-token-tooltip-label";
        termLabel.textContent = term ?? "";
        termLine.appendChild(termLabel);

        if (translation) {
          const sep = document.createElement("span");
          sep.className = "cm-token-tooltip-sep";
          sep.textContent = " → ";
          const transSpan = document.createElement("span");
          transSpan.className = "cm-token-tooltip-translation";
          transSpan.textContent = translation;
          termLine.appendChild(sep);
          termLine.appendChild(transSpan);
        }
        dom.appendChild(termLine);

        if (definition) {
          const defLine = document.createElement("div");
          defLine.className = "cm-token-tooltip-definition";
          defLine.textContent = definition;
          dom.appendChild(defLine);
        }

        return { dom };
      },
    };
  }

  return null;
});

// ─── Tooltip 样式 ─────────────────────────────────────────────────────────────

export const tokenTooltipTheme = EditorView.baseTheme({
  ".cm-token-tooltip-term": {
    padding: "4px 8px",
    fontSize: "0.875rem",
    lineHeight: "1.5",
    maxWidth: "300px",
  },
  ".cm-token-tooltip-row": {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  ".cm-token-tooltip-label": {
    fontWeight: "600",
    color: "var(--cm-token-term-color, #9333ea)",
  },
  ".cm-token-tooltip-sep": {
    color: "#9ca3af",
    fontStyle: "normal",
  },
  ".cm-token-tooltip-translation": {
    color: "inherit",
  },
  ".cm-token-tooltip-definition": {
    marginTop: "4px",
    fontSize: "0.8125rem",
    color: "#6b7280",
    fontStyle: "italic",
  },
});
