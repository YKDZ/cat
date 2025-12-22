import { TranslatableFileHandler } from "@cat/plugin-core";
import { extname } from "node:path";
import { JSONType } from "@cat/shared/schema/json";
import { TranslatableElementDataWithoutLanguageId } from "@cat/shared/schema/misc";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import type { Root, RootContent, PhrasingContent } from "mdast";
import * as z from "zod";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";

interface ElementMeta {
  index: number;
  type: string;
  depth?: number;
  lang?: string | null;
  rowIndex?: number;
  cellIndex?: number;
  identifier?: string;
}

export class MarkdownTranslatableFileHandler implements TranslatableFileHandler {
  getId(): string {
    return "MARKDOWN";
  }

  getType(): PluginServiceType {
    return "TRANSLATABLE_FILE_HANDLER";
  }

  canExtractElement(name: string): boolean {
    const e = extname(name).toLowerCase();
    return e === ".md" || e === ".markdown" || e === ".mdown";
  }

  async extractElement(
    fileContent: Buffer,
  ): Promise<TranslatableElementDataWithoutLanguageId[]> {
    const content = fileContent.toString("utf-8");
    const tree = unified().use(remarkParse).use(remarkGfm).parse(content);

    const elements: TranslatableElementDataWithoutLanguageId[] = [];
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
            // 保留脚注引用
            return `[^${node.identifier}]`;
          }
          return "";
        })
        .join("");
    };

    const processNode = (node: RootContent): void => {
      // 处理标题
      if (node.type === "heading" && "children" in node) {
        const text = extractTextFromPhrasingContent(node.children).trim();
        if (text) {
          elements.push({
            value: text,
            sortIndex: elementIndex,
            meta: {
              index: elementIndex,
              type: "heading",
              depth: node.depth,
            } satisfies ElementMeta,
          });
          elementIndex += 1;
        }
      }
      // 处理段落
      else if (node.type === "paragraph" && "children" in node) {
        const text = extractTextFromPhrasingContent(node.children).trim();
        if (text) {
          elements.push({
            value: text,
            sortIndex: elementIndex,
            meta: {
              index: elementIndex,
              type: "paragraph",
            } satisfies ElementMeta,
          });
          elementIndex += 1;
        }
      }
      // 处理列表项
      else if (node.type === "listItem" && "children" in node) {
        for (const child of node.children) {
          if (child.type === "paragraph" && "children" in child) {
            const text = extractTextFromPhrasingContent(child.children).trim();
            if (text) {
              elements.push({
                value: text,
                sortIndex: elementIndex,
                meta: {
                  index: elementIndex,
                  type: "listItem",
                } satisfies ElementMeta,
              });
              elementIndex += 1;
            }
          } else if (child.type === "list") {
            // 嵌套列表
            if ("children" in child) {
              for (const nestedItem of child.children) {
                processNode(nestedItem);
              }
            }
          }
        }
      }
      // 处理代码块
      else if (node.type === "code") {
        const text = node.value.trim();
        if (text) {
          elements.push({
            value: text,
            sortIndex: elementIndex,
            meta: {
              index: elementIndex,
              type: "code",
              lang: node.lang,
            } satisfies ElementMeta,
          });
          elementIndex += 1;
        }
      }
      // 处理引用
      else if (node.type === "blockquote" && "children" in node) {
        for (const child of node.children) {
          processNode(child);
        }
      }
      // 处理列表
      else if (node.type === "list" && "children" in node) {
        for (const child of node.children) {
          processNode(child);
        }
      }
      // 处理表格
      else if (node.type === "table" && "children" in node) {
        node.children.forEach((row, rowIndex) => {
          if (row.type === "tableRow" && "children" in row) {
            row.children.forEach((cell, cellIndex) => {
              if (cell.type === "tableCell" && "children" in cell) {
                const text = extractTextFromPhrasingContent(
                  cell.children,
                ).trim();
                if (text) {
                  elements.push({
                    value: text,
                    sortIndex: elementIndex,
                    meta: {
                      index: elementIndex,
                      type: "tableCell",
                      rowIndex,
                      cellIndex,
                    } satisfies ElementMeta,
                  });
                  elementIndex += 1;
                }
              }
            });
          }
        });
      }
      // 处理链接定义（仅提取标题文本）
      else if (node.type === "linkReference" && "children" in node) {
        const text = extractTextFromPhrasingContent(node.children).trim();
        if (text) {
          elements.push({
            value: text,
            sortIndex: elementIndex,
            meta: {
              index: elementIndex,
              type: "linkReference",
            } satisfies ElementMeta,
          });
          elementIndex += 1;
        }
      }
      // 处理图片引用（提取 alt 文本）
      else if (node.type === "imageReference") {
        const text = node.alt?.trim();
        if (text) {
          elements.push({
            value: text,
            sortIndex: elementIndex,
            meta: {
              index: elementIndex,
              type: "imageReference",
            } satisfies ElementMeta,
          });
          elementIndex += 1;
        }
      }
      // 处理脚注定义
      else if (node.type === "footnoteDefinition" && "children" in node) {
        // 提取脚注定义中的所有段落内容
        for (const child of node.children) {
          if (child.type === "paragraph" && "children" in child) {
            const text = extractTextFromPhrasingContent(child.children).trim();
            if (text) {
              elements.push({
                value: text,
                sortIndex: elementIndex,
                meta: {
                  index: elementIndex,
                  type: "footnoteDefinition",
                  identifier: node.identifier,
                } satisfies ElementMeta,
              });
              elementIndex += 1;
            }
          } else {
            // 递归处理其他类型的内容（如列表、代码块等）
            processNode(child);
          }
        }
      }
    };

    // 遍历 AST
    if ("children" in tree) {
      for (const child of tree.children) {
        processNode(child);
      }
    }

    return elements;
  }

  canGetReplacedFileContent(name: string): boolean {
    return this.canExtractElement(name);
  }

  async getReplacedFileContent(
    fileContent: Buffer,
    elements: { meta: JSONType; value: string }[],
  ): Promise<Buffer> {
    const content = fileContent.toString("utf-8");
    const tree = unified().use(remarkParse).use(remarkGfm).parse(content);

    // 创建一个映射，根据 index 快速查找翻译后的值
    const translationMap = new Map<number, string>();
    for (const element of elements) {
      const meta = z
        .object({
          index: z.number(),
          type: z.string(),
        })
        .parse(element.meta);
      translationMap.set(meta.index, element.value);
    }

    let currentIndex = 0;

    const parseFormattedText = (text: string): PhrasingContent[] => {
      // 使用 unified 和 remark-parse 来解析内联 Markdown
      // 我们将文本包装在段落中解析，然后提取出 phrasing 内容
      const wrappedText = text;
      const tempTree = unified().use(remarkParse).parse(wrappedText);

      // 从临时树中提取第一个段落的子节点
      if ("children" in tempTree && tempTree.children.length > 0) {
        const firstChild = tempTree.children[0];
        if (firstChild.type === "paragraph" && "children" in firstChild) {
          return firstChild.children;
        }
      }

      // 如果解析失败，返回纯文本
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
        // 使用类型断言确保类型兼容
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
            // 类型保护：如果不是 listItem，返回原值
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
            // 递归处理其他类型的内容
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

    // 替换树中的节点
    if ("children" in tree) {
      const newTree: Root = {
        ...tree,
        children: tree.children.map((child) => replaceInNode(child)),
      };

      // 将修改后的树转换回 Markdown
      const result = unified()
        .use(remarkStringify)
        .use(remarkGfm)
        .stringify(newTree);
      return Buffer.from(result, "utf-8");
    }

    return fileContent;
  }
}
