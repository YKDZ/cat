// oxlint-disable no-unsafe-type-assertion
import { extname } from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { cloneDeep } from "lodash-es";
import { z } from "zod";
import type { Node } from "unist";
import type {
  Root,
  Parent,
  RootContent,
  Literal,
  Image,
  ListItem,
  Paragraph,
  BlockContent,
  Text,
  Heading,
  List,
  Table,
  TableCell,
  PhrasingContent,
  Code,
} from "mdast";
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

const BLOCK_CONTENT_TYPES = new Set<string>([
  "paragraph",
  "heading",
  "thematicBreak",
  "blockquote",
  "list",
  "table",
  "html",
  "code",
]);

const MetaSchema = z.object({
  path: z.array(z.number()),
  nodeType: z.string(),
  attribute: z.union([z.literal("alt"), z.literal("title")]).optional(),
  leadingWhitespace: z.string().optional(),
  trailingWhitespace: z.string().optional(),
  parentType: z.string().optional(),
  blockType: z.string().optional(),
  blockPath: z.array(z.number()).optional(),
  headingDepth: z.number().optional(),
  listInfo: z
    .object({
      ordered: z.boolean(),
      start: z.number().optional(),
      spread: z.boolean().optional(),
    })
    .optional(),
  ancestors: z.array(z.string()).optional(),
  originalValue: z.string().optional(),
  tableInfo: z
    .object({
      tablePath: z.array(z.number()),
      rowPath: z.array(z.number()),
      cellPath: z.array(z.number()),
      rowIndex: z.number(),
      cellIndex: z.number(),
      isHeaderRow: z.boolean().optional(),
      columnAlign: z
        .union([z.literal("left"), z.literal("right"), z.literal("center")])
        .optional(),
      rowCellCount: z.number().optional(),
    })
    .optional(),
  codeInfo: z
    .object({
      lang: z.string().optional(),
      meta: z.string().optional(),
    })
    .optional(),
});

type Meta = z.infer<typeof MetaSchema>;

const isParent = (n: Node): n is Parent => {
  return (
    Object.prototype.hasOwnProperty.call(n, "children") &&
    Array.isArray((n as Parent).children)
  );
};

type AncestorInfo = {
  node: Parent;
  path: number[];
};

const hasLiteralValue = (node: Node): node is Literal & { value: string } => {
  return (
    Object.prototype.hasOwnProperty.call(node, "value") &&
    typeof (node as Literal).value === "string"
  );
};

const renderInlineChildren = (parent: Parent): string => {
  const parts: string[] = [];

  for (const child of parent.children) {
    parts.push(renderInlineNode(child));
  }

  return parts.join("");
};

const renderInlineNode = (node: Node): string => {
  switch (node.type) {
    case "text":
      return (node as Text).value ?? "";
    case "inlineCode":
      return `\`${(node as Literal).value ?? ""}\``;
    case "strong":
      return `**${renderInlineChildren(node as Parent)}**`;
    case "emphasis":
      return `*${renderInlineChildren(node as Parent)}*`;
    case "delete":
      return `~~${renderInlineChildren(node as Parent)}~~`;
    case "break":
      return "\n";
    case "link": {
      const linkNode = node as Parent & { url?: string; title?: string };
      const titleSuffix =
        typeof linkNode.title === "string" && linkNode.title !== ""
          ? ` "${linkNode.title}"`
          : "";
      return `[${renderInlineChildren(linkNode)}](${linkNode.url ?? ""}${titleSuffix})`;
    }
    case "linkReference": {
      const refNode = node as Parent & { identifier?: string };
      const identifier =
        typeof refNode.identifier === "string" ? refNode.identifier : "";
      return identifier
        ? `[${renderInlineChildren(refNode)}][${identifier}]`
        : renderInlineChildren(refNode);
    }
    case "html":
      return hasLiteralValue(node) ? node.value : "";
    case "image":
    case "imageReference":
      return "";
    default: {
      if (isParent(node)) {
        return renderInlineChildren(node);
      }
      if (hasLiteralValue(node)) {
        return node.value ?? "";
      }
      return "";
    }
  }
};

const renderBlockForExtraction = (node: Node): string => {
  switch (node.type) {
    case "paragraph":
    case "heading":
      return renderInlineChildren(node as Parent);
    case "blockquote":
    case "list":
    case "listItem": {
      if (!isParent(node)) return "";
      const parts = node.children
        .map((child) => renderBlockForExtraction(child))
        .filter((text) => text.trim() !== "");
      return parts.join("\n");
    }
    case "tableCell": {
      if (!isParent(node)) return "";
      const parts: string[] = [];
      for (const child of node.children) {
        if (
          child.type === "paragraph" ||
          child.type === "heading" ||
          child.type === "blockquote" ||
          child.type === "list" ||
          child.type === "listItem"
        ) {
          const text = renderBlockForExtraction(child);
          if (text.trim() !== "") {
            parts.push(text);
          }
        } else if (isParent(child)) {
          const text = renderBlockForExtraction(child);
          if (text.trim() !== "") {
            parts.push(text);
          }
        } else if (hasLiteralValue(child)) {
          const value = child.value.trim();
          if (value !== "") {
            parts.push(value);
          }
        } else {
          const inlineValue = renderInlineNode(child);
          if (inlineValue.trim() !== "") {
            parts.push(inlineValue.trim());
          }
        }
      }
      return parts.join("\n");
    }
    case "tableRow": {
      if (!isParent(node)) return "";
      const parts = node.children
        .map((child) =>
          child.type === "tableCell" ? renderBlockForExtraction(child) : "",
        )
        .filter((text) => text.trim() !== "");
      return parts.join(" | ");
    }
    case "table": {
      if (!isParent(node)) return "";
      const parts = node.children
        .map((child) => renderBlockForExtraction(child))
        .filter((text) => text.trim() !== "");
      return parts.join("\n");
    }
    case "code":
      return (node as Code).value ?? "";
    default: {
      if (isParent(node)) {
        return renderInlineChildren(node);
      }
      if (hasLiteralValue(node)) {
        return node.value ?? "";
      }
      return "";
    }
  }
};

const shouldExtractBlockNode = (node: Node, parentType?: string): boolean => {
  if (node.type === "paragraph") {
    return parentType !== "tableCell";
  }
  if (node.type === "heading") {
    return true;
  }
  if (node.type === "code") {
    return parentType !== "tableCell";
  }
  if (node.type === "tableCell") {
    return true;
  }
  return false;
};

const createTextNode = (value: string): Text => ({
  type: "text",
  value,
});

const parseInlineChildrenFromMarkdown = (value: string): PhrasingContent[] => {
  const fragmentRoot = unified().use(remarkParse).parse(value);
  const results: PhrasingContent[] = [];

  for (const child of fragmentRoot.children) {
    if (child.type === "paragraph") {
      results.push(...cloneDeep(child.children));
      continue;
    }
    if (child.type === "heading") {
      results.push(...cloneDeep(child.children));
      continue;
    }
    if (hasLiteralValue(child)) {
      const literalValue = child.value.trim();
      if (literalValue !== "") {
        results.push(createTextNode(literalValue));
      }
      continue;
    }
    const inlineValue = renderBlockForExtraction(child).trim();
    if (inlineValue !== "") {
      results.push(createTextNode(inlineValue));
    }
  }

  if (results.length === 0 && value.trim() !== "") {
    results.push(createTextNode(value.trim()));
  }

  return results;
};

const parseMarkdownToTableCellChildren = (
  value: string,
): TableCell["children"] => {
  const fragmentRoot = unified().use(remarkParse).parse(value);
  const children: TableCell["children"] = [];

  for (const child of fragmentRoot.children) {
    if (child.type === "table") {
      children.push(
        cloneDeep(child) as unknown as TableCell["children"][number],
      );
      continue;
    }
    if (
      child.type === "paragraph" ||
      child.type === "heading" ||
      child.type === "list" ||
      child.type === "blockquote" ||
      child.type === "code"
    ) {
      children.push(
        cloneDeep(child) as unknown as TableCell["children"][number],
      );
      continue;
    }
    if (child.type === "tableRow") {
      children.push(
        cloneDeep(child) as unknown as TableCell["children"][number],
      );
      continue;
    }
    if (isParent(child)) {
      const rendered = renderBlockForExtraction(child);
      if (rendered !== "") {
        children.push(
          cloneDeep(
            createParagraphNode(rendered),
          ) as unknown as TableCell["children"][number],
        );
      }
      continue;
    }
    if (hasLiteralValue(child)) {
      const literalValue = child.value.trim();
      if (literalValue !== "") {
        children.push(
          cloneDeep(
            createParagraphNode(literalValue),
          ) as unknown as TableCell["children"][number],
        );
      }
    }
  }

  if (children.length === 0 && value.trim() !== "") {
    children.push(
      cloneDeep(
        createParagraphNode(value.trim()),
      ) as unknown as TableCell["children"][number],
    );
  }

  return children;
};

const collectTranslatableElementsFromMarkdown = (md: string) => {
  const processor = unified().use(remarkParse);
  const rootNode = processor.parse(md);
  const result: TranslatableElementDataWithoutLanguageId[] = [];

  const traverse = (
    node: Node,
    path: number[] = [],
    ancestors: AncestorInfo[] = [],
  ): void => {
    if (!node) return;

    const parentInfo =
      ancestors.length > 0 ? ancestors[ancestors.length - 1] : undefined;
    const reversedAncestors = [...ancestors].reverse();
    const blockAncestor = reversedAncestors.find((ancestor) =>
      BLOCK_NODE_TYPES.has(ancestor.node.type),
    );
    const blockType = blockAncestor?.node.type;
    const blockPath = blockAncestor?.path;
    const headingDepth =
      blockAncestor?.node.type === "heading"
        ? (blockAncestor.node as Heading).depth
        : undefined;
    const listAncestor = reversedAncestors.find(
      (ancestor) => ancestor.node.type === "list",
    );
    let listInfo: Meta["listInfo"];
    if (listAncestor) {
      const listNode = listAncestor.node as List;
      const listStart =
        typeof listNode.start === "number" ? listNode.start : undefined;
      const listSpread =
        typeof listNode.spread === "boolean" ? listNode.spread : undefined;
      listInfo = {
        ordered: Boolean(listNode.ordered),
        start: listStart,
        spread: listSpread,
      };
    }
    const tableAncestor = reversedAncestors.find(
      (ancestor) => ancestor.node.type === "table",
    );
    const tableRowAncestor = reversedAncestors.find(
      (ancestor) => ancestor.node.type === "tableRow",
    );
    const tableCellAncestor = reversedAncestors.find(
      (ancestor) => ancestor.node.type === "tableCell",
    );

    let tableInfo: Meta["tableInfo"];
    if (tableAncestor && tableRowAncestor && tableCellAncestor) {
      const tablePath = [...tableAncestor.path];
      const rowPath = [...tableRowAncestor.path];
      const cellPath = [...tableCellAncestor.path];
      const rowIndex = rowPath[rowPath.length - 1];
      const cellIndex = cellPath[cellPath.length - 1];
      const tableNode = tableAncestor.node as Table;
      const alignValue =
        Array.isArray(tableNode.align) && typeof cellIndex === "number"
          ? tableNode.align[cellIndex]
          : undefined;
      const normalizedAlign =
        alignValue === "left" ||
        alignValue === "right" ||
        alignValue === "center"
          ? alignValue
          : undefined;
      const rowCellCount = Array.isArray(tableRowAncestor.node.children)
        ? tableRowAncestor.node.children.length
        : undefined;

      if (
        typeof rowIndex === "number" &&
        typeof cellIndex === "number" &&
        Number.isInteger(rowIndex) &&
        Number.isInteger(cellIndex)
      ) {
        tableInfo = {
          tablePath,
          rowPath,
          cellPath,
          rowIndex,
          cellIndex,
          isHeaderRow: rowIndex === 0 ? true : undefined,
          columnAlign: normalizedAlign,
          rowCellCount,
        };
      }
    }
    const ancestorsTypes = ancestors.map((ancestor) => ancestor.node.type);

    const baseMeta: Omit<Meta, "nodeType" | "attribute"> = {
      path,
      parentType: parentInfo?.node.type,
      blockType,
      blockPath,
      headingDepth,
      listInfo,
      ancestors: ancestorsTypes,
      tableInfo,
      leadingWhitespace: undefined,
      trailingWhitespace: undefined,
      originalValue: undefined,
      codeInfo: undefined,
    };

    if (shouldExtractBlockNode(node, parentInfo?.node.type)) {
      const rawBlockValue = renderBlockForExtraction(node);
      const blockValue =
        node.type === "code" ? rawBlockValue : rawBlockValue.trim();
      const hasContent =
        node.type === "code" ? rawBlockValue !== "" : blockValue !== "";
      if (hasContent) {
        const codeInfo =
          node.type === "code"
            ? {
                lang:
                  typeof (node as Code).lang === "string"
                    ? (node as Code).lang
                    : undefined,
                meta:
                  typeof (node as Code).meta === "string"
                    ? (node as Code).meta
                    : undefined,
              }
            : undefined;

        result.push({
          value: blockValue,
          meta: {
            ...baseMeta,
            nodeType: node.type,
            originalValue: rawBlockValue,
            codeInfo,
          } as Meta,
        });
      }
    }

    if (node.type === "image") {
      const img = node as Image;
      const imageBaseMeta: Meta = {
        ...baseMeta,
        nodeType: node.type,
      };

      if (typeof img.alt === "string" && img.alt.trim() !== "") {
        result.push({
          value: img.alt,
          meta: {
            ...imageBaseMeta,
            attribute: "alt",
          } as Meta,
        });
      }
      if (typeof img.title === "string" && img.title.trim() !== "") {
        result.push({
          value: img.title,
          meta: {
            ...imageBaseMeta,
            attribute: "title",
          } as Meta,
        });
      }
    }

    if (
      isParent(node) &&
      Array.isArray(node.children) &&
      node.children.length > 0
    ) {
      const nextAncestors = [...ancestors, { node, path }];
      for (let i = 0; i < node.children.length; i += 1) {
        traverse(node.children[i], [...path, i], nextAncestors);
      }
    }
  };

  traverse(rootNode, []);

  return result;
};

const isBlockContent = (node: RootContent): node is BlockContent => {
  return typeof node.type === "string" && BLOCK_CONTENT_TYPES.has(node.type);
};

const createParagraphNode = (text: string): Paragraph => {
  const value = String(text);
  const child: Text = {
    type: "text",
    value,
  };
  return {
    type: "paragraph",
    children: [child],
  };
};

const extractListItemsFromFragment = (
  fragmentRoot: Root,
  fallbackValue: string,
): RootContent[] => {
  const items: RootContent[] = [];

  for (const child of fragmentRoot.children) {
    if (child.type === "list") {
      const listNode = child;
      if (Array.isArray(listNode.children)) {
        for (const candidate of listNode.children) {
          if (candidate && candidate.type === "listItem") {
            items.push(cloneDeep(candidate));
          }
        }
      }
    } else if (child.type === "listItem") {
      items.push(cloneDeep(child));
    }
  }

  if (items.length === 0) {
    const fallbackChildren = fragmentRoot.children
      .filter(isBlockContent)
      .map((n) => cloneDeep(n));

    if (fallbackChildren.length === 0) {
      fallbackChildren.push(createParagraphNode(fallbackValue));
    }

    const listItem: ListItem = {
      type: "listItem",
      spread: false,
      children: fallbackChildren,
    };

    items.push(cloneDeep(listItem));
  }

  return items;
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
    const parsedRoot = processor.parse(original);
    const modifiedRoot = cloneDeep(parsedRoot);

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
        const meta = parsed.data;
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
          const imgNode = targetNode;
          if (meta.attribute === "alt") {
            imgNode.alt = String(e.value);
          } else if (meta.attribute === "title") {
            imgNode.title = String(e.value);
          }
          // 修改已完成，处理下一个元素
          continue;
        }

        if (targetNode.type === "heading") {
          const inlineChildren = parseInlineChildrenFromMarkdown(
            String(e.value),
          );
          targetNode.children =
            inlineChildren.length > 0 ? inlineChildren : [createTextNode("")];
          continue;
        }

        if (targetNode.type === "paragraph") {
          const inlineChildren = parseInlineChildrenFromMarkdown(
            String(e.value),
          );
          targetNode.children =
            inlineChildren.length > 0 ? inlineChildren : [createTextNode("")];
          continue;
        }

        if (targetNode.type === "tableCell") {
          const cellChildren = parseMarkdownToTableCellChildren(
            String(e.value),
          );
          const finalChildren: TableCell["children"] =
            cellChildren.length > 0
              ? cellChildren
              : ([createParagraphNode("")] as unknown as TableCell["children"]);
          targetNode.children = finalChildren;
          continue;
        }

        if (hasLiteralValue(targetNode)) {
          const literalNode = targetNode;
          if (literalNode.type === "text") {
            const originalSource =
              typeof meta.originalValue === "string"
                ? meta.originalValue
                : literalNode.value;
            const leading =
              typeof meta.leadingWhitespace === "string"
                ? meta.leadingWhitespace
                : (originalSource.match(/^\s*/)?.[0] ?? "");
            const trailing =
              typeof meta.trailingWhitespace === "string"
                ? meta.trailingWhitespace
                : (originalSource.match(/\s*$/)?.[0] ?? "");
            literalNode.value = `${leading}${String(e.value)}${trailing}`;
          } else {
            literalNode.value = String(e.value);
          }
          continue;
        }

        // 对于块级节点或带 children 的节点：把译文视为 markdown 片段解析并替换原节点
        if (BLOCK_NODE_TYPES.has(targetNode.type) || isParent(targetNode)) {
          const fragmentRoot = unified()
            .use(remarkParse)
            .parse(String(e.value));

          let replacementNodes: RootContent[] = [];

          if (targetNode.type === "listItem") {
            replacementNodes = extractListItemsFromFragment(
              fragmentRoot,
              String(e.value),
            );
          } else {
            const candidates = Array.isArray(fragmentRoot.children)
              ? fragmentRoot.children.filter(
                  (child) => child.type === targetNode.type,
                )
              : [];

            if (candidates.length > 0) {
              replacementNodes = candidates.map((node) =>
                cloneDeep<RootContent>(node),
              );
            }
          }

          const parentChildren =
            parentNode.children as unknown as RootContent[];

          if (replacementNodes.length === 0) {
            // 用一个空的 paragraph 节点替换原节点
            parentChildren.splice(targetIndex, 1, createParagraphNode(""));
          } else {
            parentChildren.splice(targetIndex, 1, ...replacementNodes);
          }
        } else {
          logger.warn("PLUGIN", {
            msg: `未能识别可替换节点类型，跳过：${targetNode.type}`,
          });
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
