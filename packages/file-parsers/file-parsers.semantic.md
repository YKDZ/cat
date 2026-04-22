---
subject: infra/file-parsers
---

`@cat/file-parsers` 提供多格式文件的解析与序列化能力，是 CAT 处理可翻译内容文件的基础工具层。

## 核心接口

所有解析器实现 `FileParser<T>` 接口，包含两个方法：

- **`parse(content: string): T`**：将原始文件文本解析为内部抽象语法表示（AST 或结构化对象），供后续元素提取使用。
- **`serialize(ast: T): string`**：将修改后的 AST 重新序列化为目标格式的文本，确保原始格式风格（缩进、注释等）尽可能保留。

## 支持格式

**Markdown 解析器**：基于 `remark` 将 Markdown 文本解析为 `mdast`（Markdown AST），每个段落、标题、列表项均可作为独立的可翻译单元提取。序列化时通过 `remark-stringify` 还原，保留原有的 ATX 标题风格与代码块语言标注。

**JSON 解析器**：递归遍历 JSON 对象树，提取所有字符串叶节点作为可翻译条目，并以点分隔路径（如 `"ui.button.submit"`）作为 key。序列化时将译文按路径写回，支持任意深度嵌套。

**YAML 解析器**：基于 `js-yaml` 解析 YAML 文件，处理逻辑与 JSON 解析器类似，额外支持多行字符串（`|` 块标量）的整体提取与还原。

## 在系统中的角色

`@cat/source-collector` 在扫描源码时调用文件解析器提取可翻译元素；`@cat/workflow` 在自动翻译完成后调用序列化方法将译文写回目标文件格式；`@cat/seed` 在加载测试数据集时也依赖 JSON / YAML 解析器读取 fixture 文件。
