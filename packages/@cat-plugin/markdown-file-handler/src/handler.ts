import { extname } from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { cloneDeep } from "lodash-es";
import { z } from "zod";
import type { Node } from "unist";
import type { Root, Parent, RootContent, Literal, Image } from "mdast";
import type { TranslatableFileHandler } from "@cat/plugin-core";
import { File } from "@cat/shared/schema/drizzle/file";
import { TranslatableElementDataWithoutLanguageId } from "@cat/shared/schema/misc";
import { JSONType } from "@cat/shared/schema/json";
import { logger } from "@cat/shared/utils";

/** 可译块类型集合 */
const BLOCK_NODE_TYPES = new Set<string>([
  "heading",
  "paragraph",
  "listItem",
  "blockquote",
  "tableCell",
  "tableRow",
  "thematicBreak",
]);

/** meta 的类型定义 */
type Meta = {
  path: number[]; // 在 AST 中从 root 开始的索引路径
  nodeType: string;
  attribute?: "alt" | "title";
};

const MetaSchema = z.object({
  path: z.array(z.number()),
  nodeType: z.string(),
  attribute: z.union([z.literal("alt"), z.literal("title")]).optional(),
});

/** 类型保护：是否为 Parent（拥有 children） */
const isParent = (n: Node): n is Parent => {
  return (
    Object.prototype.hasOwnProperty.call(n, "children") &&
    Array.isArray((n as Parent).children)
  );
};

/** 将 node 序列化为 markdown 片段字符串（尽量安全） */
const nodeToMarkdown = (node: Node): string => {
  const processor = unified().use(remarkStringify);

  // 如果 node 已经是 Root 并且有 children，直接 stringify
  if (node.type === "root" && "children" in node) {
    return processor.stringify(node as Root);
  }

  // 否则把 node 包在一个临时的 Root 中再 stringify
  // 把 node 视作 Content（mdast 除 Root 之外的可放进 children 的节点）
  const wrapper: Root = {
    type: "root",
    children: [node as RootContent],
  };

  // processor.stringify 接受 Root，返回 markdown
  return processor.stringify(wrapper);
};

/** 收集可译元素：返回 TranslatableElementData[] */
const collectTranslatableElementsFromMarkdown = (md: string) => {
  const processor = unified().use(remarkParse).use(remarkStringify);
  const rootNode = processor.parse(md) as Root;
  const result: TranslatableElementDataWithoutLanguageId[] = [];

  const traverse = (node: Node, path: number[] = []): void => {
    if (!node) return;

    // 若为块级节点并能被识别，则提取其 markdown 表示
    if (typeof node.type === "string" && BLOCK_NODE_TYPES.has(node.type)) {
      const mdText = nodeToMarkdown(node).trim();
      if (mdText !== "") {
        result.push({
          value: mdText,
          meta: {
            path,
            nodeType: node.type,
          } as Meta,
        });
      }
    }

    // image 节点：提取 alt / title（作为属性）
    if (node.type === "image") {
      // node is Image in mdast (image has alt?: string and title?: string)
      const img = node as Image;
      if (typeof img.alt === "string" && img.alt.trim() !== "") {
        result.push({
          value: img.alt,
          meta: {
            path,
            nodeType: node.type,
            attribute: "alt",
          } as Meta,
        });
      }
      if (typeof img.title === "string" && img.title.trim() !== "") {
        result.push({
          value: img.title,
          meta: {
            path,
            nodeType: node.type,
            attribute: "title",
          } as Meta,
        });
      }
    }

    // 递归 children（若存在）
    if (
      isParent(node) &&
      Array.isArray(node.children) &&
      node.children.length > 0
    ) {
      for (let i = 0; i < node.children.length; i += 1) {
        traverse(node.children[i], [...path, i]);
      }
    }
  };

  traverse(rootNode, []);

  return result;
};

export class MarkdownTranslatableFileHandler
  implements TranslatableFileHandler
{
  getId(): string {
    return "MARKDOWN";
  }

  canExtractElement(file: File): boolean {
    const e = extname(file.originName).toLowerCase();
    return e === ".md" || e === ".markdown" || e === ".mdown";
  }

  async extractElement(
    fileContent: Buffer,
  ): Promise<TranslatableElementDataWithoutLanguageId[]> {
    const text = fileContent.toString("utf-8");
    return collectTranslatableElementsFromMarkdown(text);
  }

  canGetReplacedFileContent(file: File): boolean {
    return this.canExtractElement(file);
  }

  async getReplacedFileContent(
    fileContent: Buffer,
    elements: { meta: JSONType; value: string }[],
  ): Promise<Buffer> {
    const original = fileContent.toString("utf-8");
    const processor = unified().use(remarkParse).use(remarkStringify);
    const parsedRoot = processor.parse(original) as Root;
    const modifiedRoot = cloneDeep(parsedRoot) as Root;

    for (const e of elements) {
      try {
        const parsed = MetaSchema.safeParse(e.meta as unknown);
        if (!parsed.success) {
          logger.error(
            "PLUGIN",
            { msg: "Invalid meta for markdown replacement, skip:" },
            parsed.error,
          );
          continue;
        }
        const meta = parsed.data as Meta;
        const path = meta.path;

        if (!Array.isArray(path) || path.length === 0) {
          logger.warn("PLUGIN", { msg: "Empty path in meta, skip" });
          continue;
        }

        let parentNode: Node | undefined = modifiedRoot;
        let validPath = true;

        for (let i = 0; i < path.length - 1; i += 1) {
          if (!isParent(parentNode)) {
            validPath = false;
            break;
          }
          const idx = path[i];
          if (idx < 0 || idx >= parentNode.children.length) {
            validPath = false;
            break;
          }
          parentNode = parentNode.children[idx];
        }

        if (!validPath || !isParent(parentNode)) {
          logger.warn("PLUGIN", {
            msg: `路径 '${path.join(",")}' 无效（父节点不存在或非 Parent）`,
          });
          continue;
        }

        const targetIndex = path[path.length - 1];
        if (targetIndex < 0 || targetIndex >= parentNode.children.length) {
          logger.warn("PLUGIN", {
            msg: `路径 '${path.join(",")}' 无效（索引越界）`,
          });
          continue;
        }

        const targetNode = parentNode.children[targetIndex];

        if (!targetNode || typeof targetNode.type !== "string") {
          logger.warn("PLUGIN", {
            msg: `目标节点不存在或类型不合法，路径: ${path.join(",")}`,
          });
          continue;
        }

        if (targetNode.type !== meta.nodeType) {
          logger.warn("PLUGIN", {
            msg: `目标节点类型与 meta 不匹配，期待 ${meta.nodeType}，实际 ${targetNode.type}，路径: ${path.join(",")}`,
          });
          continue;
        }

        // 如果是 image 属性替换
        if (meta.attribute && targetNode.type === "image") {
          const imgNode = targetNode as Image;
          if (meta.attribute === "alt") {
            imgNode.alt = String(e.value);
          } else if (meta.attribute === "title") {
            imgNode.title = String(e.value);
          }
          // 修改已完成，处理下一个元素
          continue;
        }

        // 对于块级节点或带 children 的节点：把译文视为 markdown 片段解析并替换原节点
        if (BLOCK_NODE_TYPES.has(targetNode.type) || isParent(targetNode)) {
          const fragmentRoot = unified()
            .use(remarkParse)
            .parse(String(e.value)) as Root;
          const newChildren = Array.isArray(fragmentRoot.children)
            ? (fragmentRoot.children as RootContent[])
            : [];

          if (newChildren.length === 0) {
            // 用一个空的 paragraph 节点替换原节点
            const emptyParagraph: RootContent = {
              type: "paragraph",
              children: [{ type: "text", value: "" } as Literal],
            } as RootContent;
            parentNode.children.splice(targetIndex, 1, emptyParagraph);
          } else {
            // 用解析出来的节点替换原单一节点
            parentNode.children.splice(targetIndex, 1, ...newChildren);
          }
        } else {
          // fallback：若节点是 Literal（如 text），直接替换 value
          if ((targetNode as Literal).value !== undefined) {
            (targetNode as Literal).value = String(e.value);
          } else {
            logger.warn("PLUGIN", {
              msg: `未能识别可替换节点类型，跳过：${targetNode.type}`,
            });
          }
        }
      } catch (err: unknown) {
        throw new Error("处理 markdown 翻译时出错：" + String(err));
      }
    }

    // 序列化回 markdown 字符串
    const out = unified().use(remarkStringify).stringify(modifiedRoot);
    return Buffer.from(out, "utf-8");
  }
}
