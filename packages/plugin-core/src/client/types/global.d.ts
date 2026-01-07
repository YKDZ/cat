export {};

declare global {
  interface Window {
    Object: ObjectConstructor;
    Array: ArrayConstructor;
    Function: FunctionConstructor;
    Node: typeof Node;
    Element: typeof Element;
    HTMLElement: typeof HTMLElement;
    console: typeof console;
  }
}
