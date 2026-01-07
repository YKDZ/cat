import { logger } from "@cat/shared/utils";
import { Distortion } from "./types.ts";
import DOMPurify from "dompurify";

export const createDocumentDistortion = (
  pluginId: string,
  _win: Window,
): Distortion => ({
  get: (_target, key) => {
    if (key === "cookie") return () => "";
    if (key === "getElementById") {
      return () => (_id: string) => {
        logger.warn("WEB", {
          msg: `Plugin ${pluginId} blocked getElementById`,
        });
        return null;
      };
    }
    return undefined;
  },
});

export const createElementDistortion = (_win: Window): Distortion => ({
  set: (target, key, value) => {
    if (key === "innerHTML" || key === "outerHTML") {
      // 确保 value 是字符串，否则 sanitize 可能会出错
      const strValue = typeof value === "string" ? value : String(value);

      // oxlint-disable-next-line no-unsafe-type-assertion
      (target as Record<string | symbol, unknown>)[key] =
        DOMPurify.sanitize(strValue);
      return false; // 拦截并处理了赋值
    }
    return true;
  },
});

export const createNodeDistortion = (win: Window): Distortion => ({
  get: (target, key) => {
    if (
      key === "parentNode" ||
      key === "parentElement" ||
      key === "ownerDocument"
    ) {
      return (originalNode: object) => {
        // 获取真实的父节点
        // oxlint-disable-next-line no-unsafe-type-assertion
        const parent = Reflect.get(originalNode, key) as Node | null;

        // 结合引用检查和属性检查
        if (
          !parent ||
          parent === win.document ||
          parent === win.document.documentElement ||
          parent === win.document.head ||
          parent.nodeType === 9 || // DOCUMENT_NODE
          // oxlint-disable-next-line no-unsafe-type-assertion
          (parent as Element).tagName === "HTML" ||
          // oxlint-disable-next-line no-unsafe-type-assertion
          (parent as Element).tagName === "HEAD"
        ) {
          return null;
        }
        return parent;
      };
    }
    return undefined;
  },
});

export const createPrototypeDistortion = (win: Window): Distortion => ({
  set: (target, _key, _value) => {
    if (
      target === win.Object.prototype ||
      target === win.Array.prototype ||
      target === win.Function.prototype
    ) {
      logger.warn("WEB", { msg: "Prototype pollution attempt blocked!" });
      return false;
    }
    return true;
  },
});

export const createVueDistortion = (): Distortion => ({
  get: (_target, key) => {
    if (key === "config") {
      return () => ({
        globalProperties: {},
        errorHandler: null,
        warnHandler: null,
        compilerOptions: {},
      });
    }
    return undefined;
  },
  // 禁止在 Vue 根对象上写入
  set: () => false,
});

export const createFetchDistortion = (
  pluginId: string,
  win: Window,
): Distortion => ({
  apply: (target, _thisArg, argArray) => {
    const [input] = argArray;
    const urlStr = String(input instanceof Request ? input.url : input);

    // TODO 基于插件 manifest 声明放通 fetch
    const allowedOrigins = ["https://dummyjson.com"];
    const isAllowed = allowedOrigins.some((origin) =>
      urlStr.startsWith(origin),
    );

    if (!isAllowed) {
      logger.warn("WEB", { msg: `Plugin fetch blocked: ${urlStr}` });
      throw new Error(`Permission denied: Fetch to ${urlStr} blocked.`);
    }

    logger.info("WEB", { msg: `Plugin ${pluginId} fetching ${urlStr}` });

    // oxlint-disable-next-line no-unsafe-type-assertion no-unsafe-function-type no-unsafe-function-type no-unsafe-return
    return Reflect.apply(target as Function, win, argArray);
  },
});
