---
subject: infra/screenshot-collector
---

`@cat/screenshot-collector` 基于 Playwright 为 CAT 的可翻译元素提供视觉上下文截图，帮助译者理解每个元素在真实界面中的位置与展示方式。

## 工作原理

截图采集器按页面路由遍历 CAT 前端应用，自动定位带有 `data-element-id` 属性的 DOM 节点（由前端 i18n 工具注入），截取包含该节点的截图，并将截图上传至 `@cat/domain` 的文件存储。

## NavigationStep

`NavigationStep` 描述到达目标页面前所需的导航动作序列（如登录、选择项目、打开文档），支持：

- `goto(url)`：直接跳转到 URL。
- `click(selector)`：点击指定选择器的元素。
- `fill(selector, value)`：填充输入框（用于登录表单等）。
- `waitForSelector(selector)`：等待某元素出现后再继续。

配置文件中每条路由规则对应一个 `NavigationStep[]`，使采集器可处理需要认证或多步操作才能访问的深层页面。

## 元素高亮

截图时可对目标元素添加半透明色块高亮（`highlightElement: true`），使译者一眼识别截图中对应的文本位置。高亮不修改原始 DOM，仅通过 Playwright 的 `evaluate` 注入临时样式。

## 上传与关联

每张截图通过 oRPC 端点上传，并与对应的 `elementId` 关联存储。前端翻译编辑器侧边栏会展示该元素的最新截图，供译者参考上下文。截图采集通常在 `@cat/seed` 播种完成后运行，确保截图内容包含真实测试数据。
