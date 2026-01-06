// oxlint-disable no-unsafe-argument no-explicit-any explicit-module-boundary-types no-unsafe-return
// oxlint-disable no-unsafe-member-access
import { Membrane } from "./membrane.ts";
import {
  createDocumentDistortion,
  createElementDistortion,
  createNodeDistortion,
  createPrototypeDistortion,
} from "./distortions.ts";
import { logger } from "@cat/shared/utils";
import * as Vue from "vue";
import { SandboxGlobalHandler } from "./handlers.ts";
import { Distortion } from "./types.ts";

export function createSandbox(
  pluginId: string,
  win: Window,
): {
  evaluate: (code: string) => void;
} {
  const membrane = new Membrane({
    pluginId,
    distortions: new Map(),
  });

  // --- 注册畸变规则 (Distortions) ---

  // 1. Document
  membrane.distortions.set(
    win.document,
    createDocumentDistortion(pluginId, win),
  );

  // 2. 准备基础规则
  const nodeDistortion = createNodeDistortion(win); // 包含 get: parentNode 等
  const elementDistortion = createElementDistortion(win); // 包含 set: innerHTML

  // 3. [CRITICAL FIX] 创建组合规则 (Composite Distortion)
  // 解决原型链遮蔽问题：确保 Element 层级既有 Get 也有 Set 规则
  const compositeDistortion: Distortion = {
    get: nodeDistortion.get, // 继承 Node 的 DOM 遍历防御
    set: elementDistortion.set, // 继承 Element 的 XSS 防御
  };

  // 4. 注册规则
  // Node 原型：只需要防御遍历
  // @ts-expect-error type mismatch
  membrane.distortions.set(win.Node.prototype, nodeDistortion);

  // Element/HTMLElement 原型：使用组合规则 (防御遍历 + 清洗写入)
  // @ts-expect-error type mismatch
  membrane.distortions.set(win.Element.prototype, compositeDistortion);
  // @ts-expect-error type mismatch
  membrane.distortions.set(win.HTMLElement.prototype, compositeDistortion);

  // 5. Object/Array Prototypes
  const protoDistortion = createPrototypeDistortion(win);
  // @ts-expect-error type mismatch
  membrane.distortions.set(win.Object.prototype, protoDistortion);
  // @ts-expect-error type mismatch
  membrane.distortions.set(win.Array.prototype, protoDistortion);

  // --- 构造沙箱全局对象 ---

  const rawSandboxGlobal = {
    Vue,
    // @ts-expect-error No needed
    console: win.console,
    // oxlint-disable-next-line unbound-method
    setTimeout: win.setTimeout,
    // oxlint-disable-next-line unbound-method
    setInterval: win.setInterval,
    // oxlint-disable-next-line unbound-method
    clearTimeout: win.clearTimeout,
    // oxlint-disable-next-line unbound-method
    clearInterval: win.clearInterval,

    document: win.document,

    // 封锁 parent/top
    parent: null,
    top: null,
    localStorage: null,
    sessionStorage: null,

    window: {},
    self: {},
    globalThis: {},

    fetch: safeFetch,

    customElements: {
      define: (
        name: string,
        constructor: CustomElementConstructor,
        options?: ElementDefinitionOptions,
      ) => {
        const scopedName = `${pluginId}-${name}`;
        logger.info("WEB", { msg: `Registering ${name} as ${scopedName}` });
        win.customElements.define(scopedName, constructor, options);
      },
      get: (name: string) => win.customElements.get(`${pluginId}-${name}`),
      whenDefined: async (name: string) =>
        win.customElements.whenDefined(`${pluginId}-${name}`),
    },
  };

  // 修正循环引用
  // oxlint-disable-next-line no-unsafe-member-access no-unsafe-type-assertion
  (rawSandboxGlobal as any).window = rawSandboxGlobal;
  // oxlint-disable-next-line no-unsafe-member-access no-unsafe-type-assertion
  (rawSandboxGlobal as any).self = rawSandboxGlobal;
  // oxlint-disable-next-line no-unsafe-member-access no-unsafe-type-assertion
  (rawSandboxGlobal as any).globalThis = rawSandboxGlobal;
  // oxlint-disable-next-line no-unsafe-member-access no-unsafe-type-assertion
  (rawSandboxGlobal as any).parent = rawSandboxGlobal;
  // oxlint-disable-next-line no-unsafe-member-access no-unsafe-type-assertion
  (rawSandboxGlobal as any).top = rawSandboxGlobal;

  const globalHandler = new SandboxGlobalHandler(membrane, rawSandboxGlobal);
  const redGlobal = new Proxy(rawSandboxGlobal, globalHandler);

  return {
    evaluate: (code: string): void => {
      // oxlint-disable-next-line no-implied-eval
      const safeExecutor = new Function(
        "sandbox",
        `with(sandbox) { 
            ${code} 
         }`,
      );
      // oxlint-disable-next-line no-unsafe-call
      safeExecutor(redGlobal);
    },
  };
}

const safeFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  // 1. 还原/解析 URL 字符串
  let urlStr: string;
  if (typeof input === "string") {
    urlStr = input;
  } else if (input instanceof window.URL) {
    urlStr = input.href;
  } else if (input && typeof input === "object" && "url" in input) {
    // 处理 Request 对象 (可能是被解包后的 Host Request)
    urlStr = input.url;
  } else {
    urlStr = String(input);
  }

  const allowedOrigins = [
    "https://dummyjson.com",
    // "https://your-api.com",
  ];

  const isAllowed = allowedOrigins.some((origin) => urlStr.startsWith(origin));

  if (!isAllowed) {
    logger.warn("WEB", {
      msg: `Plugin fetch blocked`,
      url: urlStr,
    });
    throw new Error(
      `Permission denied: Fetch to ${urlStr} is not allowed by sandbox policy.`,
    );
  }

  // 3. 记录并放行
  // logger.info("WEB", { msg: `Plugin ${pluginId} fetching ${urlStr}` });
  return window.fetch(input, init);
};
