// oxlint-disable explicit-module-boundary-types no-unsafe-argument @typescript-eslint/no-explicit-any no-unsafe-member-access
export const basicSandboxGlobal = (win: Window) => {
  const basic = {
    // oxlint-disable-next-line unbound-method
    setTimeout: win.setTimeout,
    // oxlint-disable-next-line unbound-method
    setInterval: win.setInterval,
    // oxlint-disable-next-line unbound-method
    clearTimeout: win.clearTimeout,
    // oxlint-disable-next-line unbound-method
    clearInterval: win.clearInterval,

    document: win.document,

    parent: null,
    top: null,
    localStorage: null,
    sessionStorage: null,

    window: {},
    self: {},
    globalThis: {},
  };

  // oxlint-disable-next-line no-unsafe-member-access no-unsafe-type-assertion
  (basic as any).window = basic;
  // oxlint-disable-next-line no-unsafe-member-access no-unsafe-type-assertion
  (basic as any).self = basic;
  // oxlint-disable-next-line no-unsafe-member-access no-unsafe-type-assertion
  (basic as any).globalThis = basic;
  // oxlint-disable-next-line no-unsafe-member-access no-unsafe-type-assertion
  (basic as any).parent = basic;
  // oxlint-disable-next-line no-unsafe-member-access no-unsafe-type-assertion
  (basic as any).top = basic;

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
      if (!registry.get(name)) registry.set(name, { constructor, options });
    },
    get: (name: string): CustomElementConstructor | undefined =>
      registry.get(name)?.constructor,
  } satisfies Partial<typeof customElements>;
};
