// oxlint-disable no-unsafe-argument no-explicit-any explicit-module-boundary-types no-unsafe-return
import { logger } from "@cat/shared/utils";
import { Distortion } from "./types.ts";
import DOMPurify from "dompurify";

export const createDocumentDistortion = (
  pluginId: string,
  _win: Window,
): Distortion => ({
  get: (target, key) => {
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
      // oxlint-disable-next-line no-unsafe-member-access
      target[key] = DOMPurify.sanitize(value);
      return false;
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
      return (originalNode: Node) => {
        // 获取真实的父节点
        const parent = Reflect.get(originalNode, key);

        // 结合引用检查和属性检查
        if (
          !parent ||
          parent === win.document ||
          parent === win.document.documentElement ||
          parent === win.document.head ||
          (parent as Node).nodeType === 9 || // DOCUMENT_NODE
          // oxlint-disable-next-line no-unsafe-type-assertion
          (parent as Element).tagName === "HTML" ||
          // oxlint-disable-next-line no-unsafe-type-assertion
          (parent as Element).tagName === "HEAD"
        ) {
          // 如果这里被命中，返回 null，因为 Handler 现在会正确处理 convertBlueToRed(null) -> null
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
      // @ts-expect-error No needed
      // oxlint-disable-next-line no-unsafe-member-access
      target === win.Object.prototype ||
      // @ts-expect-error No needed
      // oxlint-disable-next-line no-unsafe-member-access
      target === win.Array.prototype ||
      // @ts-expect-error No needed
      // oxlint-disable-next-line no-unsafe-member-access
      target === win.Function.prototype
    ) {
      logger.warn("WEB", { msg: "Prototype pollution attempt blocked!" });
      return false;
    }
    return true;
  },
});

export const createVueDistortion = (): Distortion => ({
  get: (target, key) => {
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
  apply: (target, thisArg, argArray) => {
    const [input] = argArray;
    const urlStr = String(input instanceof Request ? input.url : input);

    // 统一的策略检查
    const allowedOrigins = ["https://dummyjson.com"];
    const isAllowed = allowedOrigins.some((origin) =>
      urlStr.startsWith(origin),
    );

    if (!isAllowed) {
      logger.warn("WEB", { msg: `Plugin fetch blocked: ${urlStr}` });
      throw new Error(`Permission denied: Fetch to ${urlStr} blocked.`);
    }

    logger.info("WEB", { msg: `Plugin ${pluginId} fetching ${urlStr}` });

    // 调用原始 fetch，Membrane 会自动处理返回值的 wrapping
    return Reflect.apply(target, win, argArray);
  },
});
