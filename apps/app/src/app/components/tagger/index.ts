import type { VNode } from "vue";
import { h, ref } from "vue";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";

export type Clipper = {
  id: number | string;
  name: string;
  splitter: RegExp;
  highlight: boolean;
  /**
   * A function returned VNode will be execute,
   * null will be rendered to the part text.
   */
  content: string | ((part: PartData) => VNode) | null;
  /**
   * Define whether the clipped part should be translated
   */
  translatable: boolean;
  needConfirmation: boolean;
  verifyHandlers: VerifyHandler[];
  clickHandlers: ClickHandler[];
};

export type VerifyHandler = {
  id: number;
  name: string;
  handler: (
    clipper: Clipper,
    sourceParts: PartData[],
    translationParts: PartData[],
  ) => Promise<ClipperVerifyResult>;
};

export type ClickHandler = {
  id: number;
  name: string;
  handler: (clipper: Clipper, part: PartData) => Promise<void>;
};

export type PartData = {
  index: number;
  text: string;
  subParts: PartData[];
  clipperId: string | number | null;
};

export type ClipperVerifyResult = {
  isPass: boolean;
  error: string;
  clipperId: string | number | null;
};

const shouldMatchCount: VerifyHandler = {
  id: 1,
  name: "Should Match Count",

  handler: async (
    clipper: Clipper,
    sourceParts: PartData[],
    translationParts: PartData[],
  ) => {
    const sourceCount = sourceParts.filter(
      (part) => part.clipperId === clipper.id,
    ).length;
    const translationCount = translationParts.filter(
      (part) => part.clipperId === clipper.id,
    ).length;
    const isPass = sourceCount === translationCount;
    return {
      clipperId: clipper.id,
      isPass,
      error: isPass
        ? ""
        : `${clipper.name}数量不匹配（原文：${sourceCount} 个，译文：${translationCount} 个）`,
    } satisfies ClipperVerifyResult;
  },
};

const shouldMatchContent: VerifyHandler = {
  id: 1,
  name: "Should Match Content",

  handler: async (
    clipper: Clipper,
    sourceParts: PartData[],
    translationParts: PartData[],
  ) => {
    const source = sourceParts
      .filter((part) => part.clipperId === clipper.id)
      .map((part) => part.text)
      .join(", ");
    const translation = translationParts
      .filter((part) => part.clipperId === clipper.id)
      .map((part) => part.text)
      .join(", ");
    const isPass = source === translation;

    return {
      clipperId: clipper.id,
      isPass,
      error: isPass
        ? ""
        : `${clipper.name}内容不匹配（原文：${source}，译文：${translation}）`,
    } satisfies ClipperVerifyResult;
  },
};

const copyContent: ClickHandler = {
  id: 1,
  name: "Copy Content",

  async handler(clipper: Clipper, part: PartData) {
    const { insert } = useEditorTableStore();
    await insert(part.text);
  },
};

export const clippers = ref<Clipper[]>([
  {
    id: 1,
    splitter: /(\n)/g,
    name: "\\n",
    content: () => {
      return h(
        "span",
        {
          style: {
            display: "inline",
            whiteSpace: "pre-wrap",
          },
        },
        [
          h("span", {
            class: "icon-[codicon--newline]",
            style: {
              display: "inline-block",
            },
            "aria-hidden": "true",
          }),
          "\n",
        ],
      );
    },
    translatable: false,
    highlight: true,
    needConfirmation: true,
    clickHandlers: [copyContent],
    verifyHandlers: [shouldMatchContent],
  },
  {
    id: 2,
    splitter: /[%@][A-Za-z]/g,
    name: "placeholder",
    content: null,
    translatable: false,
    highlight: true,
    needConfirmation: true,
    clickHandlers: [copyContent],
    verifyHandlers: [shouldMatchContent],
  },
  {
    id: 3,
    splitter: / /g,
    name: "space",
    content: () => {
      return h(
        "span",
        {
          style: {
            display: "inline-block",
            width: "0.5rem",
            position: "relative",
            verticalAlign: "middle",
            lineHeight: "0",
            WebkitTapHighlightColor: "transparent",
            userSelect: "text",
          },
        },
        [
          "\u00A0",
          h("span", {
            style: {
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "0.2rem",
              height: "0.2rem",
              borderRadius: "50%",
              background: "gray",
              pointerEvents: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              MozUserSelect: "none",
            },
            "aria-hidden": "true",
          }),
        ],
      );
    },
    translatable: false,
    highlight: true,
    needConfirmation: false,
    clickHandlers: [copyContent],
    verifyHandlers: [shouldMatchCount],
  },
  {
    id: 4,
    splitter: /\d+/g,
    name: "number",
    content: null,
    translatable: false,
    highlight: true,
    needConfirmation: true,
    clickHandlers: [copyContent],
    verifyHandlers: [shouldMatchContent],
  },
]);

export const recursiveSplit = (
  text: string,
  clippers: { id: string | number; splitter: RegExp }[],
): PartData[] => {
  // 把所有 splitter 的正则源合并
  const combinedPattern = clippers
    .map(({ splitter }) => `(?:${splitter.source})`)
    .join("|");
  // 用于主拆分（带 g）
  const combinedRe = new RegExp(`(${combinedPattern})`, "g");
  // 用于测试某段文字里是否还含有任一 splitter（不带 g）
  const combinedReNoG = new RegExp(combinedPattern);

  const parts: PartData[] = [];
  let lastPos = 0;
  let m: RegExpExecArray | null;

  while ((m = combinedRe.exec(text)) !== null) {
    const [matchedText] = m;
    const matchStart = m.index;
    const matchEnd = combinedRe.lastIndex;

    // 拆出当前分隔符前的文本段 slice
    if (matchStart > lastPos) {
      const slice = text.slice(lastPos, matchStart);
      const hasAny = combinedReNoG.test(slice);
      parts.push({
        index: lastPos,
        text: slice,
        clipperId: null,
        subParts: hasAny ? recursiveSplit(slice, clippers) : [],
      });
    }

    // 找到 matchedText 属于哪个 clipper
    let whichId: string | number | null = null;
    for (const { id, splitter } of clippers) {
      if (new RegExp(`^${splitter.source}$`).test(matchedText)) {
        whichId = id;
        break;
      }
    }

    // 把当前 clipper 从列表中剔除，再对 matchedText 做递归（若还有其它 splitter）
    const childClippers = clippers.filter((c) => c.id !== whichId);
    const needRecur = childClippers.some((c) => c.splitter.test(matchedText));
    const subParts = needRecur
      ? recursiveSplit(matchedText, childClippers)
      : [];

    parts.push({
      index: matchStart,
      text: matchedText,
      clipperId: whichId,
      subParts,
    });

    lastPos = matchEnd;
  }

  // 处理尾部剩余文本
  if (lastPos < text.length) {
    const slice = text.slice(lastPos);
    const hasAny = combinedReNoG.test(slice);
    parts.push({
      index: lastPos,
      text: slice,
      clipperId: null,
      subParts: hasAny ? recursiveSplit(slice, clippers) : [],
    });
  }

  return parts;
};
