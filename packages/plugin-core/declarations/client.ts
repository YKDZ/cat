export interface SandboxGlobal {
  console: Console;
  document: Document;
  localStorage: undefined;
  sessionStorage: undefined;
  window: SandboxGlobal;
  self: SandboxGlobal;
  globalThis: SandboxGlobal;
  parent: SandboxGlobal;
  top: SandboxGlobal;
  [key: string | symbol]: unknown;
}

export type BrowserWindow = Window & typeof globalThis;
export type DistortionHandler = (target: object, receiver: unknown) => unknown;
export type DistortionSetter = (
  target: object,
  value: unknown,
  receiver: unknown,
) => boolean;
export interface Distortion {
  get?(
    originalTarget: object,
    key: string | symbol,
  ): DistortionHandler | undefined;
  set?(originalTarget: object, key: string | symbol, value: unknown): boolean;
  apply?(target: object, thisArg: unknown, argArray: unknown[]): unknown;
  construct?(target: object, argArray: unknown[], newTarget: unknown): object;
}
export interface MembraneOptions {
  distortions?: Map<object, Distortion>;
  pluginId: string;
}
export type RealmSide = "blue" | "red";

export declare const UNWRAP: unique symbol;
export declare const unwrap: (value: unknown) => unknown;
export declare class Membrane {
  distortions: Map<object, Distortion>;
  pluginId: string;
  constructor(options: MembraneOptions);
  convertBlueToRed(blueValue: unknown): unknown;
  convertRedToBlue(redValue: unknown): unknown;
  unwrap(proxy: unknown): unknown;
}
export declare class BlueToRedHandler implements ProxyHandler<object> {
  constructor(membrane: Membrane, originalTarget: object);
  get(target: object, key: string | symbol, receiver: unknown): unknown;
  set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: unknown,
  ): boolean;
  apply(target: object, thisArg: unknown, argArray: unknown[]): unknown;
  construct(target: object, argArray: unknown[], newTarget: unknown): object;
}
export declare class RedToBlueHandler implements ProxyHandler<object> {
  constructor(membrane: Membrane);
}
export declare class SandboxGlobalHandler extends BlueToRedHandler {
  has(target: object, key: string | symbol): boolean;
}

export declare const createDocumentDistortion: (
  pluginId: string,
  win: BrowserWindow,
) => Distortion;
export declare const createElementDistortion: (
  win: BrowserWindow,
) => Distortion;
export declare const createNodeDistortion: (win: BrowserWindow) => Distortion;
export declare const createPrototypeDistortion: (
  win: BrowserWindow,
) => Distortion;
export declare const createVueDistortion: () => Distortion;
export declare const createFetchDistortion: (
  pluginId: string,
  win: BrowserWindow,
) => Distortion;

export type DistortionSetup = (
  membrane: Membrane,
  pluginId: string,
  win: BrowserWindow,
) => void;
export type GlobalContextBuilder = (
  pluginId: string,
  win: BrowserWindow,
) => Record<string, unknown>;
export interface SandboxOptions {
  distortionSetup?: DistortionSetup;
  globalContextBuilder: GlobalContextBuilder;
}
export declare const setupDefaultDistortions: DistortionSetup;
export declare const createSandbox: (
  pluginId: string,
  win: BrowserWindow,
  options: SandboxOptions,
) => { evaluate(code: string): void };
export declare const basicSandboxGlobal: (win: BrowserWindow) => SandboxGlobal;
export declare const safeCustomElements: (
  registry: Map<
    string,
    {
      constructor: CustomElementConstructor;
      options?: ElementDefinitionOptions;
    }
  >,
) => Partial<typeof customElements>;
