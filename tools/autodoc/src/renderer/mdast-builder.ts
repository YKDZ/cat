import type {
  Root,
  Heading,
  Paragraph,
  Code,
  InlineCode,
  Text,
  Link,
  Strong,
  List,
  ListItem,
  ThematicBreak,
  PhrasingContent,
  BlockContent,
  RootContent,
} from "mdast";

/**
 * @zh 创建 mdast 根节点。
 * @en Create an mdast root node.
 */
export const root = (...children: RootContent[]): Root => ({
  type: "root",
  children,
});

/**
 * @zh 创建 mdast 标题节点。
 * @en Create an mdast heading node.
 */
export const heading = (
  depth: 1 | 2 | 3 | 4 | 5 | 6,
  ...children: PhrasingContent[]
): Heading => ({
  type: "heading",
  depth,
  children,
});

/**
 * @zh 创建 mdast 段落节点。
 * @en Create an mdast paragraph node.
 */
export const paragraph = (...children: PhrasingContent[]): Paragraph => ({
  type: "paragraph",
  children,
});

/**
 * @zh 创建 mdast 代码块节点。
 * @en Create an mdast code block node.
 */
export const code = (lang: string, value: string): Code => ({
  type: "code",
  lang,
  value,
});

/**
 * @zh 创建 mdast 行内代码节点。
 * @en Create an mdast inline code node.
 */
export const inlineCode = (value: string): InlineCode => ({
  type: "inlineCode",
  value,
});

/**
 * @zh 创建 mdast 文本节点。
 * @en Create an mdast text node.
 */
export const text = (value: string): Text => ({
  type: "text",
  value,
});

/**
 * @zh 创建 mdast 链接节点。
 * @en Create an mdast link node.
 */
export const link = (url: string, ...children: PhrasingContent[]): Link => ({
  type: "link",
  url,
  children,
});

/**
 * @zh 创建 mdast 粗体节点。
 * @en Create an mdast strong node.
 */
export const strong = (...children: PhrasingContent[]): Strong => ({
  type: "strong",
  children,
});

/**
 * @zh 创建 mdast 列表节点。
 * @en Create an mdast list node.
 */
export const list = (ordered: boolean, ...items: ListItem[]): List => ({
  type: "list",
  ordered,
  children: items,
});

/**
 * @zh 创建 mdast 列表项节点。
 * @en Create an mdast list item node.
 */
export const listItem = (...children: BlockContent[]): ListItem => ({
  type: "listItem",
  children,
});

/**
 * @zh 创建 mdast 分隔线节点。
 * @en Create an mdast thematic break node.
 */
export const thematicBreak = (): ThematicBreak => ({
  type: "thematicBreak",
});
