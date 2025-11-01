# Markdown File Handler

这是 CAT 的可翻译文件处理器插件之一，实现了 TranslatableFileHandler 接口，用于处理 Markdown 文件，从中提取出可翻译文本和元数据并返回（元数据用于充当上下文标注，以及将文本替换到文件中时的定位）。

插件遵从以下规则处理 Markdown 文本。

## 标题和段落

```md
# 标题 1

段落 **1**.

## 标题 2

段落 `2` 的~~文本量~~更*大*.
```

会被提取为四个可翻译元素，分别是：

```txt
标题 1

段落 **1**.

标题 2

段落 `2` 的~~文本量~~更*大*.
```

注意到标题的 `#` 标记不被算作可翻译文本的一部分，但是行内代码、行内粗体、斜体和删除线标记等则可以翻译。

## Linebreak

视为同一块：

```md
行 1  
行 2，上一行的行末有两个空格代表换行显示
```

上述内容被提取为单独一个元素：

```txt
行 1
行 2，上一行的行末有两个空格代表换行显示
```

## 列表

对每一个列表项视为一个块：

```md
- 1
- 2
- 3

1. A
2. B
3. C

- [x] Write the press release
- [ ] Update the website
- [ ] Contact the media
```

会被提取为九个元素：

```txt
1

2

3

A

B

C

Write the press release

Update the website

Contact the media
```

注意列表的 `-` 或 `1.` 等前缀不视为可翻译。

## 代码块

整个代码块被视为一个元素：

````
```ts
// Code block TS
export * from "test";

console.log("test");
``\`
````

会被提取为一个元素：

```txt
// Code block TS
export * from "test";

console.log("test");
```

## Quote

对于 Quote 标记，每一个 Quote 视为一个元素，嵌套或多段落 Quote 视为不同元素：

```
> Element 1
>
> Element 2
>
>> Element 3
```

会被提取为三个元素：

```
Element 1

Element 2

Element 3
```

对于带有其他标记的 Quote，递归应用其他规则:

```
> #### The quarterly results look great!
>
> - Revenue was off the chart.
> - Profits were higher than ever.
>
>  *Everything* is going according to **plan**.
```

会被提取为四个元素：

```
The quarterly results look great!

Revenue was off the chart.

Profits were higher than ever.

*Everything* is going according to **plan**.
```

## 链接和图片

对于链接和图片，只有 `[]` 内的文本被视为可翻译：

```
[Element 1](link)
![Element 2](img)
```

会被提取为两个元素：

```
Element 1

Element 2
```

## Table

对于 Table，每一个非空单元格都被视为一个元素

```md
| Syntax    | Description |
| --------- | ----------- |
| Header    | Title       |
| Paragraph | Text        |
```

会被提取为六个元素：

```txt
Syntax

Description

Header

Paragraph

Title

Text
```

## 脚注

行内的脚注视为可翻译，脚注本身则只有说明可翻译：

```md
这里是一个带脚注[^1]的句子

[^1]: 这是脚注的内容
```

会被提取为两个元素：

```
这里是一个带脚注[^1]的句子

这是脚注的内容
```
