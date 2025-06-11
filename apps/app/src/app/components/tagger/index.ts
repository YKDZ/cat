import { useEditorStore } from "@/app/stores/editor";
import type { VNode } from "vue";
import { ref } from "vue";

export type Clipper = {
  id: number | string;
  splitter: RegExp;
  highlight: boolean;
  /**
   * String starts with 'i-' will be rendered as icon,
   * Other string will be rendered normally,
   * A function returned VNode will be execute,
   * null will be rendered to the part text.
   */
  content: string | ((part: PartData) => VNode) | null;
  /**
   * Define whether the clipped part should be translated
   */
  translatable: boolean;
  onVerify: (
    sourceParts: PartData[],
    translationParts: PartData[],
  ) => Promise<ClipperVerifyResult>;
  onClick?: (part: PartData) => void;
};

export type PartData = {
  index: number;
  text: string;
  clipperId: string | number | null;
};

export type ClipperVerifyResult = {
  clipperId: string | number | null;
  isPass: boolean;
  error: string;
};

export const clippers = ref<Clipper[]>([
  {
    id: 1,
    splitter: /(\n)/g,
    content: "i-codicon:newline",
    translatable: false,
    highlight: true,
    onClick: () => {
      const { insert } = useEditorStore();
      insert("\n");
    },
    onVerify: async (sourceParts: PartData[], translationParts: PartData[]) => {
      const isPass =
        sourceParts.filter((part) => part.text === "\n").length ===
        translationParts.filter((part) => part.text === "\n").length;
      return {
        clipperId: 1,
        isPass,
        error: isPass ? "" : "换行符数量不匹配",
      };
    },
  },
  {
    id: 2,
    splitter: /[%@][A-Za-z]/g,
    content: null,
    translatable: false,
    highlight: true,
    onClick: (part: PartData) => {
      const { insert } = useEditorStore();
      insert(part.text);
    },
    onVerify: async (sourceParts: PartData[], translationParts: PartData[]) => {
      const isPass =
        sourceParts.filter((part) => part.clipperId === 2).length ===
        translationParts.filter((part) => part.clipperId === 2).length;
      return {
        clipperId: 2,
        isPass,
        error: isPass ? "" : "变量数量不匹配",
      };
    },
  },
]);
