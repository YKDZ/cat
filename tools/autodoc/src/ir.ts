/**
 * @zh 源码位置信息。
 * @en Source location info in the monorepo.
 */
export interface SourceLocation {
  /** @zh monorepo 根下的相对路径 @en Relative path from monorepo root */
  filePath: string;
  /** @zh 起始行号（1-based） @en Start line number (1-based) */
  line: number;
  /** @zh 结束行号（1-based） @en End line number (1-based) */
  endLine: number;
}

/**
 * @zh 函数参数的中间表示。
 * @en Intermediate representation of a function parameter.
 */
export interface ParameterIR {
  /** @zh 参数名 @en Parameter name */
  name: string;
  /** @zh 参数类型字符串 @en Parameter type string */
  type: string;
  /** @zh 参数描述 @en Parameter description */
  description?: string;
  /** @zh 是否可选 @en Whether the parameter is optional */
  optional: boolean;
}

/**
 * @zh 接口或类型属性的中间表示。
 * @en Intermediate representation of a property in an interface or type.
 */
export interface PropertyIR {
  /** @zh 属性名 @en Property name */
  name: string;
  /** @zh 属性类型字符串 @en Property type string */
  type: string;
  /** @zh 属性描述 @en Property description */
  description?: string;
  /** @zh 是否可选 @en Whether the property is optional */
  optional: boolean;
}

/**
 * @zh 导出符号的中间表示。
 * @en Intermediate representation of an exported symbol.
 */
export interface SymbolIR {
  /** @zh 符号唯一 ID，格式为 "pkg:module/path:name" @en Unique symbol ID in format "pkg:module/path:name" */
  id: string;
  /** @zh 符号名称 @en Symbol name */
  name: string;
  /** @zh 符号类型 @en Symbol kind */
  kind: "function" | "interface" | "type" | "enum" | "const";
  /** @zh 符号英文描述 @en English description of the symbol */
  description?: string;
  /** @zh 完整 TypeScript 签名字符串 @en Full TypeScript signature string */
  signature?: string;
  /** @zh 变量声明的原始源码文本（保留类型注解） @en Raw source text of the variable declaration (preserving type annotation) */
  rawDeclaration?: string;
  /** @zh 函数参数列表 @en Function parameter list */
  parameters?: ParameterIR[];
  /** @zh 函数返回类型 @en Function return type */
  returnType?: string;
  /** @zh 函数返回值描述 @en Function return value description */
  returnDescription?: string;
  /** @zh 是否为异步函数 @en Whether the function is async */
  isAsync: boolean;
  /** @zh 是否已导出 @en Whether the symbol is exported */
  isExported: boolean;
  /** @zh 源码位置 @en Source location */
  sourceLocation: SourceLocation;
  /** @zh 接口/类型的属性列表 @en Properties for interfaces/types */
  properties?: PropertyIR[];
}

/**
 * @zh 单个源文件模块的中间表示。
 * @en Intermediate representation of a single source file module.
 */
export interface ModuleIR {
  /** @zh 模块相对于包根目录的路径 @en Module path relative to the package root */
  relativePath: string;
  /** @zh 模块中的导出符号列表 @en List of exported symbols in the module */
  symbols: SymbolIR[];
}

/**
 * @zh 整个包的中间表示。
 * @en Intermediate representation of a whole package.
 */
export interface PackageIR {
  /** @zh 包名（如 "@cat/domain"） @en Package name (e.g. "@cat/domain") */
  name: string;
  /** @zh 包的绝对路径 @en Absolute path to the package */
  path: string;
  /** @zh 包描述（来自 package.json#description） @en Package description (from package.json#description) */
  description?: string;
  /** @zh 包优先级 @en Package priority */
  priority: "high" | "medium" | "low";
  /** @zh 包中的模块列表 @en List of modules in the package */
  modules: ModuleIR[];
}
