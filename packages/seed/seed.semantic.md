---
subject: infra/seed
---

`@cat/seed` 提供开发与测试环境的数据播种基础设施，通过声明式 YAML 配置文件驱动数据库初始化，是 E2E 测试、评测（`@cat/eval`）和截图采集（`@cat/screenshot-collector`）的前置依赖。

## DevSeed 配置

每份播种数据集对应一个 YAML 配置文件（`DevSeedConfig`），声明：

- **`dataset`**：要加载的 JSON / YAML fixture 文件路径列表，包含 User、Project、Document、Element、Translation、Glossary 等实体的原始数据。
- **`pipeline`**：播种步骤列表（如 `create_users`、`create_projects`、`import_elements`、`submit_translations`），顺序执行。
- **`options`**：控制幂等行为（`skipIfExists`）、是否清除现有数据（`clean`）以及目标 Schema。

## RefResolver

`RefResolver` 解析 fixture 文件中的跨实体引用（`$ref: "user:alice"` 等），将声明式引用替换为实际数据库 ID，确保关联关系在播种后一致。这使 fixture 可以独立维护，无需硬编码 ID。

## 播种流程

1. 加载 YAML 配置，解析 `dataset` 路径下的所有 fixture 文件。
2. 以 `RefResolver` 解析跨实体引用。
3. 依次执行 `pipeline` 步骤，每步调用对应的领域命令（`@cat/domain`）将数据写入数据库。
4. 若某步骤失败，回滚已写入的数据（事务性保证）。
5. 播种完成后输出摘要（创建数量、跳过数量、失败条目）。

## 使用场景

- **E2E 测试**（Playwright）：在 `globalSetup` 中调用 `runSeed(config)` 初始化浏览器测试所需的用户与项目数据。
- **评测**（`@cat/eval`）：每个评测 Suite 的 `setup` 阶段加载对应 dataset，确保评测环境隔离可重复。
- **截图采集**（`@cat/screenshot-collector`）：需要真实数据驱动页面渲染，播种后再执行截图脚本。
