import type { Root, RootContent, PhrasingContent } from "mdast";

import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import * as z from "zod";

import type { ElementData, FileParser, SerializeElement } from "./types.ts";

import { toJsonPointerRef } from "./stable-ref.ts";

interface ElementMeta {
  index: number;
  type: string;
  depth?: number;
  lang?: string | null;
  rowIndex?: number;
  cellIndex?: number;
  identifier?: string;
  astPath?: readonly (string | number)[];
}

export const markdownParser: FileParser = {
  id: "MARKDOWN",

  canParse(fileName: string): boolean {
    const lower = fileName.toLowerCase();
    return (
      lower.endsWith(".md") ||
      lower.endsWith(".markdown") ||
      lower.endsWith(".mdown")
    );
  },

  parse(content: string): ElementData[] {
    const tree = unified().use(remarkParse).use(remarkGfm).parse(content);

    const elements: ElementData[] = [];
    let elementIndex = 0;

    const extractTextFromPhrasingContent = (
      nodes: PhrasingContent[],
    ): string => {
      return nodes
        .map((node) => {
          if (node.type === "text") {
            return node.value;
          } else if (node.type === "emphasis" && "children" in node) {
            const text = extractTextFromPhrasingContent(node.children);
            return `*${text}*`;
          } else if (node.type === "strong" && "children" in node) {
            const text = extractTextFromPhrasingContent(node.children);
            return `**${text}**`;
          } else if (node.type === "delete" && "children" in node) {
            const text = extractTextFromPhrasingContent(node.children);
            return `~~${text}~~`;
          } else if (node.type === "inlineCode") {
            return `\`${node.value}\``;
          } else if (node.type === "link" && "children" in node) {
            return extractTextFromPhrasingContent(node.children);
          } else if (node.type === "image") {
            return node.alt || "";
          } else if (node.type === "break") {
            return "\n";
          } else if (node.type === "footnoteReference") {
            return `[^${node.identifier}]`;
          }
          return "";
        })
        .join("");
    };

    const locationFromNode = (n: {
      type: string;
      position?: { start: { line: number }; end: { line: number } };
    }) =>
      n.position
        ? {
            location: {
              startLine: n.position.start.line,
              endLine: n.position.end.line,
              custom: { nodeType: n.type },
            },
          }
        : {};

    const stableMarkdownRef = (
      node: RootContent,
      path: readonly (string | number)[],
      fallbackIndex: number,
    ): string => {
      return toJsonPointerRef("markdown", [node.type, ...path, fallbackIndex]);
    };

    const processNode = (
      node: RootContent,
      path: readonly (string | number)[] = [],
    ): void => {
      if (node.type === "heading" && "children" in node) {
        const text = extractTextFromPhrasingContent(node.children).trim();
        if (text) {
          const ref = stableMarkdownRef(node, path, elementIndex);
          elements.push({
            ref,
            stableSourceRef: ref,
            text,
            localOrder: elementIndex,
            meta: {
              index: elementIndex,
              type: "heading",
              depth: node.depth,
              astPath: path,
            } satisfies ElementMeta,
            ...locationFromNode(node),
          });
          elementIndex += 1;
        }
      } else if (node.type === "paragraph" && "children" in node) {
        const text = extractTextFromPhrasingContent(node.children).trim();
        if (text) {
          const ref = stableMarkdownRef(node, path, elementIndex);
          elements.push({
            ref,
            stableSourceRef: ref,
            text,
            localOrder: elementIndex,
            meta: {
              index: elementIndex,
              type: "paragraph",
              astPath: path,
            } satisfies ElementMeta,
            ...locationFromNode(node),
          });
          elementIndex += 1;
        }
      } else if (node.type === "listItem" && "children" in node) {
        for (const child of node.children) {
          if (child.type === "paragraph" && "children" in child) {
            const text = extractTextFromPhrasingContent(child.children).trim();
            if (text) {
              const ref = stableMarkdownRef(node, path, elementIndex);
              elements.push({
                ref,
                stableSourceRef: ref,
                text,
                localOrder: elementIndex,
                meta: {
                  index: elementIndex,
                  type: "listItem",
                  astPath: path,
                } satisfies ElementMeta,
                ...locationFromNode(child),
              });
              elementIndex += 1;
            }
          } else if (child.type === "list") {
            if ("children" in child) {
              child.children.forEach((nestedItem, nestedIndex) => {
                processNode(nestedItem, [...path, "children", nestedIndex]);
              });
            }
          }
        }
      } else if (node.type === "code") {
        const text = node.value.trim();
        if (text) {
          const ref = stableMarkdownRef(node, path, elementIndex);
          elements.push({
            ref,
            stableSourceRef: ref,
            text,
            localOrder: elementIndex,
            meta: {
              index: elementIndex,
              type: "code",
              lang: node.lang ?? null,
              astPath: path,
            } satisfies ElementMeta,
            ...locationFromNode(node),
          });
          elementIndex += 1;
        }
      } else if (node.type === "blockquote" && "children" in node) {
        node.children.forEach((child, childIndex) => {
          processNode(child, [...path, "children", childIndex]);
        });
      } else if (node.type === "list" && "children" in node) {
        node.children.forEach((child, childIndex) => {
          processNode(child, [...path, "children", childIndex]);
        });
      } else if (node.type === "table" && "children" in node) {
        node.children.forEach((row, rowIndex) => {
          if (row.type === "tableRow" && "children" in row) {
            row.children.forEach((cell, cellIndex) => {
              if (cell.type === "tableCell" && "children" in cell) {
                const text = extractTextFromPhrasingContent(
                  cell.children,
                ).trim();
                if (text) {
                  const ref = stableMarkdownRef(
                    node,
                    [...path, "children", rowIndex, "children", cellIndex],
                    elementIndex,
                  );
                  elements.push({
                    ref,
                    stableSourceRef: ref,
                    text,
                    localOrder: elementIndex,
                    meta: {
                      index: elementIndex,
                      type: "tableCell",
                      rowIndex,
                      cellIndex,
                      astPath: [
                        ...path,
                        "children",
                        rowIndex,
                        "children",
                        cellIndex,
                      ],
                    } satisfies ElementMeta,
                    ...locationFromNode(cell),
                  });
                  elementIndex += 1;
                }
              }
            });
          }
        });
      } else if (node.type === "linkReference" && "children" in node) {
        const text = extractTextFromPhrasingContent(node.children).trim();
        if (text) {
          const ref = stableMarkdownRef(node, path, elementIndex);
          elements.push({
            ref,
            stableSourceRef: ref,
            text,
            localOrder: elementIndex,
            meta: {
              index: elementIndex,
              type: "linkReference",
              astPath: path,
            } satisfies ElementMeta,
            ...locationFromNode(node),
          });
          elementIndex += 1;
        }
      } else if (node.type === "imageReference") {
        const text = node.alt?.trim();
        if (text) {
          const ref = stableMarkdownRef(node, path, elementIndex);
          elements.push({
            ref,
            stableSourceRef: ref,
            text,
            localOrder: elementIndex,
            meta: {
              index: elementIndex,
              type: "imageReference",
              astPath: path,
            } satisfies ElementMeta,
            ...locationFromNode(node),
          });
          elementIndex += 1;
        }
      } else if (node.type === "footnoteDefinition" && "children" in node) {
        for (const child of node.children) {
          if (child.type === "paragraph" && "children" in child) {
            const text = extractTextFromPhrasingContent(child.children).trim();
            if (text) {
              const ref = stableMarkdownRef(node, path, elementIndex);
              elements.push({
                ref,
                stableSourceRef: ref,
                text,
                localOrder: elementIndex,
                meta: {
                  index: elementIndex,
                  type: "footnoteDefinition",
                  identifier: node.identifier,
                  astPath: path,
                } satisfies ElementMeta,
                ...locationFromNode(child),
              });
              elementIndex += 1;
            }
          } else {
            processNode(child, [...path, "children"]);
          }
        }
      }
    };

    if ("children" in tree) {
      tree.children.forEach((child, childIndex) => {
        processNode(child, [childIndex]);
      });
    }

    return elements;
  },

  serialize(content: string, elements: SerializeElement[]): string {
    const tree = unified().use(remarkParse).use(remarkGfm).parse(content);

    const translationMap = new Map<number, string>();
    for (const element of elements) {
      const meta = z
        .object({
          index: z.int(),
          type: z.string(),
        })
        .parse(element.meta);
      translationMap.set(meta.index, element.text);
    }

    let currentIndex = 0;

    const parseFormattedText = (text: string): PhrasingContent[] => {
      const tempTree = unified().use(remarkParse).parse(text);

      if ("children" in tempTree && tempTree.children.length > 0) {
        const firstChild = tempTree.children[0];
        if (firstChild.type === "paragraph" && "children" in firstChild) {
          return firstChild.children;
        }
      }

      return [{ type: "text", value: text }];
    };

    const replaceInNode = (node: RootContent): RootContent => {
      if (node.type === "heading" && "children" in node) {
        const translated = translationMap.get(currentIndex);
        if (translated !== undefined) {
          const newNode: RootContent = {
            ...node,
            children: parseFormattedText(translated),
          };
          currentIndex += 1;
          return newNode;
        }
        currentIndex += 1;
      } else if (node.type === "paragraph" && "children" in node) {
        const translated = translationMap.get(currentIndex);
        if (translated !== undefined) {
          const newNode: RootContent = {
            ...node,
            children: parseFormattedText(translated),
          };
          currentIndex += 1;
          return newNode;
        }
        currentIndex += 1;
      } else if (node.type === "listItem" && "children" in node) {
        const newChildren: RootContent[] = [];
        for (const child of node.children) {
          if (child.type === "paragraph" && "children" in child) {
            const translated = translationMap.get(currentIndex);
            if (translated !== undefined) {
              newChildren.push({
                ...child,
                children: parseFormattedText(translated),
              });
              currentIndex += 1;
            } else {
              newChildren.push(child);
              currentIndex += 1;
            }
          } else if (child.type === "list" && "children" in child) {
            const replacedList: RootContent = {
              ...child,
              children: child.children.map((item) => {
                const replaced = replaceInNode(item);
                if (replaced.type === "listItem") {
                  return replaced;
                }
                return item;
              }),
            };
            newChildren.push(replacedList);
          } else {
            newChildren.push(child);
          }
        }
        return {
          ...node,
          // oxlint-disable-next-line no-unsafe-type-assertion
          children: newChildren as typeof node.children,
        };
      } else if (node.type === "code") {
        const translated = translationMap.get(currentIndex);
        if (translated !== undefined) {
          currentIndex += 1;
          return { ...node, value: translated };
        }
        currentIndex += 1;
      } else if (node.type === "blockquote" && "children" in node) {
        return {
          ...node,
          // oxlint-disable-next-line no-unsafe-type-assertion
          children: node.children.map((child) =>
            replaceInNode(child),
          ) as typeof node.children,
        };
      } else if (node.type === "table" && "children" in node) {
        return {
          ...node,
          children: node.children.map((row) => {
            if (row.type === "tableRow" && "children" in row) {
              return {
                ...row,
                children: row.children.map((cell) => {
                  if (cell.type === "tableCell" && "children" in cell) {
                    const translated = translationMap.get(currentIndex);
                    if (translated !== undefined) {
                      currentIndex += 1;
                      return {
                        ...cell,
                        children: parseFormattedText(translated),
                      };
                    }
                    currentIndex += 1;
                  }
                  return cell;
                }),
              };
            }
            return row;
          }),
        };
      } else if (node.type === "list" && "children" in node) {
        return {
          ...node,
          children: node.children.map((child) => {
            const replaced = replaceInNode(child);
            if (replaced.type === "listItem") {
              return replaced;
            }
            return child;
          }),
        };
      } else if (node.type === "footnoteDefinition" && "children" in node) {
        const newChildren: RootContent[] = [];
        for (const child of node.children) {
          if (child.type === "paragraph" && "children" in child) {
            const translated = translationMap.get(currentIndex);
            if (translated !== undefined) {
              newChildren.push({
                ...child,
                children: parseFormattedText(translated),
              });
              currentIndex += 1;
            } else {
              newChildren.push(child);
              currentIndex += 1;
            }
          } else {
            newChildren.push(replaceInNode(child));
          }
        }
        return {
          ...node,
          // oxlint-disable-next-line no-unsafe-type-assertion
          children: newChildren as unknown as typeof node.children,
        };
      }

      return node;
    };

    if ("children" in tree) {
      const newTree: Root = {
        ...tree,
        children: tree.children.map((child) => replaceInNode(child)),
      };

      const result = unified()
        .use(remarkStringify)
        .use(remarkGfm)
        .stringify(newTree);
      return result;
    }

    return content;
  },
};
