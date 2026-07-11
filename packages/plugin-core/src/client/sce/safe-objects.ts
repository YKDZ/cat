import type { BrowserWindow, SandboxGlobal } from "#/client/sce/types.ts";

export const basicSandboxGlobal = (win: BrowserWindow): SandboxGlobal => {
  // oxlint-disable-next-line no-unsafe-type-assertion
  const basic = {
    console: win.console,
    document: win.document,
    localStorage: undefined,
    sessionStorage: undefined,
  } as SandboxGlobal;

  basic.window = basic;
  basic.self = basic;
  basic.globalThis = basic;
  basic.parent = basic;
  basic.top = basic;

  return basic;
};

export const safeCustomElements = (
  registry: Map<
    string,
    {
      constructor: CustomElementConstructor;
      options?: ElementDefinitionOptions;
    }
  >,
): Partial<typeof customElements> => {
  return {
    define: (
      name: string,
      constructor: CustomElementConstructor,
      options?: ElementDefinitionOptions,
    ): void => {
      if (!registry.get(name)) {
        registry.set(name, {
          constructor,
          ...(options === undefined ? {} : { options }),
        });
      }
    },
    get: (name: string): CustomElementConstructor | undefined =>
      registry.get(name)?.constructor,
  } satisfies Partial<typeof customElements>;
};
