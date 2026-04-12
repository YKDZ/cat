---
description: Project context and coding guidelines for AI to follow when generating code or answering questions.
paths: ["**/*.{ts,vue,js}"]
---

# 类型安全与函数风格规范

## 正面限制

1. **默认优先箭头函数。** 在 Vue `<script setup>`、回调、组合式函数、小型工具函数和新加的局部 helper 中，优先使用箭头函数。
2. **优先使用精确类型。** 尽量使用 `unknown`、泛型、判别联合、类型守卫和领域类型，而不是宽泛占位类型。
3. **把不安全边界收窄到最小范围。** 第三方库类型不完整时，把适配逻辑收敛到小的 adapter / shim / test helper，而不是把 `any` 扩散进业务代码。

## 负面限制

1. **不要把“箭头函数优先”误解成“仓库里永远不能出现 `function`”。** 现有代码库里存在合法的 `function` 声明；不要为了语法风格重写稳定代码。
2. **不要**在本可直接写成箭头函数的局部逻辑里继续新增 `function` 声明。
3. **不要**在应用/库代码里新增裸 `any`、`as any`、`as unknown as T` 这类不安全断言，除非确有边界型例外。
4. **不要**用宽泛占位类型掩盖真实建模缺失；如果有更具体的领域类型，就用它。

## 允许的例外

以下场景可以保留或引入 `function` / 受控的 `any`：

- 生成器、需要 hoist 的 helper、依赖 `this` / `new` / overload syntax 的 API
- 声明文件、框架 shim、第三方测试桩、lint rule fixture 等边界文件
- 上游同步代码或已有稳定模块；除非正在顺手重构，否则不要只为语法风格改动

如果必须使用 `any` 或不安全断言，请把范围收窄，并在附近写明原因。

## 例子

### 推荐：普通局部逻辑用箭头函数

```ts
const toIds = (items: { id: string }[]) => items.map((item) => item.id);
```

### 允许：语义上更适合 `function`

```ts
export function* walkNodes(root: TreeNode): Iterable<TreeNode> {
  yield root;
}
```

### 避免：把 `any` 扩散进业务代码

```ts
// ❌ Avoid
const payload = response as any;

// ✅ Better
const payload = response as ApiResponse;
```
